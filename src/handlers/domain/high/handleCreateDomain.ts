import * as z from 'zod';
import { createArguments } from '../../../lib/handlers/createArguments';
import { MASTER_LANGUAGE_DESCRIPTION } from '../../../lib/masterLanguage';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * CreateDomain Handler - ABAP Domain Creation via ADT API
 *
 * Uses AdtClient.getDomain().{validate,create,lock,readMetadata,
 * updateMetadata,unlock,check,activate} from @mcp-abap-adt/adt-clients 19.
 *
 * A lifecycle, not one call: validate the name, create the bare object, lock
 * it, read-patch-write the properties the caller gave (through `withLock`,
 * released on every path out), wait for the write to be visible, check the
 * inactive version, and optionally activate. The lock wraps only the
 * read-modify-write in the middle — `create` and `check` are their own
 * requests outside it, matching the order the pre-migration handler ran
 * them in: `unlock` then the wait then `check`, not the other way round —
 * `check` is the first call after the write that reads it back, so it is
 * the one the wait has to sit ahead of. The pre-migration handler's own
 * wait was `read({withLongPolling: true})`; domain exposes no plain `read`
 * in adt-clients 19 (only `readMetadata`), so the wait here is
 * `readMetadata({withLongPolling: true})`, discarded for its result but not
 * for what it does — this repository's own `documentPatch.ts` documents the live
 * incident behind it: a read of a not-yet-ready object answers 200 with an
 * empty body, never a 404.
 *
 * **`config.packageName` never reaches the wire on `updateMetadata`.** The
 * shipped `updateDomain()` wire function (`core/domain/update.js`) builds
 * its URL and PUT from `args.domain_name`, `args.transport_request` and
 * `document` only — `args.package_name` is passed in but never read. Not
 * sent (the create call above still carries it, where it is read).
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
import type { XmlRead } from '../../../lib/xml/tree';
import { validateTransportRequest } from '../../../utils/transportValidation';

export const TOOL_DEFINITION = {
  name: 'CreateDomain',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Create a new ABAP domain in SAP system. Creates the domain object in initial state.',
  inputSchema: createArguments('CreateDomain', {
    domain_name: z.string().describe('Domain name.'),
    description: z
      .string()
      .optional()
      .describe(
        '(optional) Domain description. If not provided, domain_name will be used.',
      ),
    package_name: z.string().describe('Package the domain is created in.'),
    transport_request: z
      .string()
      .optional()
      .describe(
        '(optional) Transport request number, not a task. Required for transportable packages.',
      ),
    datatype: z
      .string()
      .default('CHAR')
      .optional()
      .describe(
        '(optional) Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.',
      ),
    length: z
      .number()
      .default(100)
      .optional()
      .describe('(optional) Field length (max depends on datatype)'),
    decimals: z
      .number()
      .default(0)
      .optional()
      .describe('(optional) Decimal places (for DEC, CURR, QUAN types)'),
    conversion_exit: z
      .string()
      .optional()
      .describe(
        '(optional) Conversion exit routine name (without CONVERSION_EXIT_ prefix)',
      ),
    lowercase: z
      .boolean()
      .default(false)
      .optional()
      .describe('(optional) Allow lowercase input'),
    sign_exists: z
      .boolean()
      .default(false)
      .optional()
      .describe('(optional) Field has sign (+/-)'),
    value_table: z
      .string()
      .optional()
      .describe('(optional) Value table name for foreign key relationship'),
    activate: z
      .boolean()
      .default(true)
      .optional()
      .describe('(optional) Activate domain after creation (default: true)'),
    fixed_values: z
      .array(
        z.object({
          low: z.string().describe("Fixed value (e.g., '001', 'A')"),
          text: z.string().describe('Description text for the fixed value'),
        }),
      )
      .optional()
      .describe('(optional) Array of fixed values for domain value range'),
    master_language: z
      .string()
      .optional()
      .describe(MASTER_LANGUAGE_DESCRIPTION),
    ...DETAIL_SHAPE,
  }),
} as const;

type DomainArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleCreateDomain(
  context: HandlerContext,
  args: DomainArgs,
) {
  const { connection, logger } = context;

  if (!args?.domain_name) {
    return return_error('Domain name is required');
  }
  const packageName = args?.package_name;
  if (!packageName) {
    return return_error('Package name is required');
  }

  validateTransportRequest(packageName, args.transport_request);

  const domainName = args.domain_name.toUpperCase();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateDomain', detail },
    async (): Promise<IAdtResponse<AdtReading<XmlRead>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getDomain(
        resultsFor(domainDocuments),
      );

      const checked = await sequence(
        atStep('validate', () =>
          obj.validate(
            {
              domainName,
              description: args.description || domainName,
              packageName,
            },
            { analyse: analyseException },
          ),
        ),
        atStep('create', () =>
          withAdtHeaders(context, 'domain.create', (headers) =>
            obj.create(
              {
                domainName,
                description: args.description || domainName,
                packageName,
                transportRequest: args.transport_request,
                masterLanguage: args.master_language,
              },
              { headers, analyse: analyseException },
            ),
          ),
        ),
        () =>
          withLock(
            () => obj.lock({ domainName }, { analyse: analyseLock }),
            (
              lockHandle,
            ): Promise<IAdtResponse<AdtReading<XmlRead>, IAdtError>> =>
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
                        description: args.description || domainName,
                        datatype: args.datatype || 'CHAR',
                        length: args.length || 100,
                        decimals: args.decimals || 0,
                        conversion_exit: args.conversion_exit,
                        lowercase: args.lowercase || false,
                        sign_exists: args.sign_exists || false,
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
              ),
            (lockHandle) =>
              obj.unlock({ domainName }, lockHandle, {
                analyse: analyseException,
              }),
            { type: 'DOMAIN', name: domainName },
          ),
        // Best-effort (a credential failure ends the call): wait for the write to be visible, right before the
        // first call that reads it back — this is the call most likely to
        // meet a not-yet-ready object (see `documentPatch.ts`), so the wait sits
        // immediately ahead of it, exactly where the pre-migration handler
        // put it (between `unlock` and `check`).
        atStep('check', async () => {
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
          return withAdtHeaders(context, 'domain.check', (headers) =>
            obj.check({ domainName }, undefined, {
              headers,
              analyse: analyseException,
            }),
          );
        }),
      );

      if (!checked.ok || !shouldActivate) {
        return checked;
      }

      return carryCleanup(
        checked,
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
