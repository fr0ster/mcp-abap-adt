import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * UpdateDomain Handler - Update Existing ABAP Domain
 *
 * Uses AdtClient.getDomain().{lock,readMetadata,updateMetadata,check,unlock,
 * activate} from @mcp-abap-adt/adt-clients 19, through `withLock` — the lock
 * is held for the read-modify-write-check in its body, and released on
 * every path out (a refused read, a refused write, a refused check, a
 * thrown patch all still unlock).
 *
 * Workflow: lock -> (read, patch, write, check) -> unlock -> (wait for the
 * write to be visible) -> (activate). `check` runs unconditionally, not
 * gated by `activate` — the pre-migration handler ran it the same way, and
 * a refusal there stops the answer exactly as a refused write would (both
 * are steps of the `sequence` below; `sequence` hands back whichever one
 * refused, untouched). The wait between `unlock` and `activate` is the
 * pre-migration handler's long-polling `readMetadata({withLongPolling:
 * true})`, discarded for its result but not for what it does: this
 * repository's own `documentPatch.ts` documents the live incident behind it — a
 * read of a not-yet-ready object answers 200 with an empty body, never a
 * 404, so a slow read can otherwise patch nothing and PUT a document
 * missing a field that was in fact set all along.
 *
 * **The patched document goes in `options.source`.** One channel since
 * `interfaces-adt@9`, which merged the old `config.document`/
 * `options.sourceCode` split and dropped the `xmlContent` nothing read:
 * `AdtDomain.updateMetadata()` reads `options?.source` and passes it straight
 * to the PUT body. Verified against `AdtDomain.ts` and `core/domain/update.ts`
 * in adt-clients 22. See `handleUpdateDomain.ts` (low) for the longer account.
 *
 * **`config.packageName` never reaches the wire on an update.** The shipped
 * `updateDomain()` wire function (`core/domain/update.js`) builds its URL
 * and PUT from `args.domain_name`, `args.transport_request` and `document`
 * only — `args.package_name` is passed in but never read. Not sent.
 */

import {
  domainDocuments,
  patchDomainDocument,
} from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer, unlessCredentialFailure } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { domainChanges } from '../../../lib/strategies/documentChanges';
import { patchedDocument } from '../../../lib/strategies/documentPatch';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { atStep } from '../../../lib/strategies/step';
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'UpdateDomain',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Update an existing ABAP domain. Locks, updates with provided parameters (complete replacement), unlocks, and optionally activates.',
  inputSchema: z.object({
    domain_name: z.string().describe('Domain name to update'),
    description: z
      .string()
      .optional()
      .describe('New domain description (optional)'),
    package_name: z.string().describe('Package name'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number, not a task. Required for transportable packages.',
      ),
    datatype: z
      .string()
      .optional()
      .describe(
        'Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.',
      ),
    length: z
      .number()
      .optional()
      .describe('Field length (max depends on datatype)'),
    decimals: z
      .number()
      .optional()
      .describe('Decimal places (for DEC, CURR, QUAN types)'),
    conversion_exit: z
      .string()
      .optional()
      .describe(
        'Conversion exit routine name (without CONVERSION_EXIT_ prefix)',
      ),
    lowercase: z.boolean().optional().describe('Allow lowercase input'),
    sign_exists: z.boolean().optional().describe('Field has sign (+/-)'),
    value_table: z
      .string()
      .optional()
      .describe('Value table name for foreign key relationship'),
    activate: z
      .boolean()
      .default(true)
      .optional()
      .describe('Activate domain after update (default: true)'),
    fixed_values: z
      .array(
        z.object({
          low: z.string().describe("Fixed value (e.g., '001', 'A')"),
          text: z.string().describe('Description text for the fixed value'),
        }),
      )
      .optional()
      .describe('Array of fixed values for domain value range'),
    ...DETAIL_SHAPE,
  }),
} as const;

type DomainArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleUpdateDomain(
  context: HandlerContext,
  args: DomainArgs,
) {
  const { connection, logger } = context;

  if (!args?.domain_name) {
    return return_error('Domain name is required');
  }
  if (!args?.package_name) {
    return return_error('Package name is required');
  }

  validateTransportRequest(args.package_name, args.transport_request);

  const domainName = args.domain_name.toUpperCase();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateDomain', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getDomain(
        resultsFor(domainDocuments),
      );

      const written = await withLock(
        () => obj.lock({ domainName }, { analyse: analyseLock }),
        (lockHandle): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> =>
          sequence(
            atStep('read metadata', () =>
              obj.readMetadata(
                { domainName },
                { version: 'workingArea', analyse: analyseException },
              ),
            ),
            async (current) =>
              patchedDocument(
                patchDomainDocument(
                  current.raw,
                  domainChanges({
                    description: args.description,
                    datatype: args.datatype,
                    length: args.length,
                    decimals: args.decimals,
                    conversion_exit: args.conversion_exit,
                    lowercase: args.lowercase,
                    sign_exists: args.sign_exists,
                    value_table: args.value_table,
                    fixed_values: args.fixed_values,
                  }),
                ),
                `domain ${domainName}`,
              ),
            atStep('update metadata', (document) =>
              withAdtHeaders(context, 'domain.updateMetadata', (headers) =>
                obj.updateMetadata(
                  {
                    domainName,
                    transportRequest: args.transport_request,
                  },
                  {
                    headers,
                    source: document,
                    lockHandle,
                    analyse: analyseException,
                  },
                ),
              ),
            ),
            atStep('check', () =>
              withAdtHeaders(context, 'domain.check', (headers) =>
                obj.check({ domainName }, undefined, {
                  headers,
                  analyse: analyseException,
                }),
              ),
            ),
          ),
        (lockHandle) =>
          obj.unlock({ domainName }, lockHandle, { analyse: analyseException }),
        { type: 'DOMAIN', name: domainName },
      );

      if (!written.ok) {
        return written;
      }

      // Best-effort (a credential failure ends the call): wait for the write to be visible before activating.
      // Every outcome is discarded — activation answers explicitly if the
      // object still is not ready.
      await obj
        .readMetadata(
          { domainName },
          {
            version: 'inactive',
            withLongPolling: true,
            analyse: analyseException,
          },
        )
        .catch(unlessCredentialFailure);

      if (!shouldActivate) {
        return written;
      }

      return carryCleanup(
        written,
        atStep('activate', () =>
          withAdtHeaders(context, 'domain.activate', (headers) =>
            obj.activate(
              { domainName },
              { headers, analyse: analyseActivation },
            ),
          ),
        ),
      );
    },
    project(detail, terseWrite),
  );
}
