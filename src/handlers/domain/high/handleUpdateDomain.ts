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
 * repository's own `xmlPatch.ts` documents the live incident behind it — a
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

import { domainDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { patchDomainXml } from '../../../lib/strategies/domainPatch';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { extractXmlString } from '../../../lib/strategies/xmlPatch';
import { return_error } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'UpdateDomain',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update, Create. Subject: Domain. Will be useful for updating or creating domain. Update an existing ABAP domain. Locks, updates with provided parameters (complete replacement), unlocks, and optionally activates.',
  inputSchema: {
    type: 'object',
    properties: {
      domain_name: {
        type: 'string',
        description: 'Domain name to update (e.g., ZZ_TEST_0001)',
      },
      description: {
        type: 'string',
        description: 'New domain description (optional)',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects)',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      datatype: {
        type: 'string',
        description:
          'Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.',
      },
      length: {
        type: 'number',
        description: 'Field length (max depends on datatype)',
      },
      decimals: {
        type: 'number',
        description: 'Decimal places (for DEC, CURR, QUAN types)',
      },
      conversion_exit: {
        type: 'string',
        description:
          'Conversion exit routine name (without CONVERSION_EXIT_ prefix)',
      },
      lowercase: {
        type: 'boolean',
        description: 'Allow lowercase input',
      },
      sign_exists: {
        type: 'boolean',
        description: 'Field has sign (+/-)',
      },
      value_table: {
        type: 'string',
        description: 'Value table name for foreign key relationship',
      },
      activate: {
        type: 'boolean',
        description: 'Activate domain after update (default: true)',
        default: true,
      },
      fixed_values: {
        type: 'array',
        description: 'Array of fixed values for domain value range',
        items: {
          type: 'object',
          properties: {
            low: {
              type: 'string',
              description: "Fixed value (e.g., '001', 'A')",
            },
            text: {
              type: 'string',
              description: 'Description text for the fixed value',
            },
          },
          required: ['low', 'text'],
        },
      },
      ...DETAIL_PROPERTY,
    },
    required: ['domain_name', 'package_name'],
  },
} as const;

interface DomainArgs {
  domain_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  datatype?: string;
  length?: number;
  decimals?: number;
  conversion_exit?: string;
  lowercase?: boolean;
  sign_exists?: boolean;
  value_table?: string;
  activate?: boolean;
  fixed_values?: Array<{ low: string; text: string }>;
  detail?: 'terse' | 'full' | 'raw';
}

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
            () =>
              obj.readMetadata({ domainName }, { analyse: analyseException }),
            (current) =>
              obj.updateMetadata(
                {
                  domainName,
                  transportRequest: args.transport_request,
                },
                {
                  source: patchDomainXml(
                    extractXmlString(current.raw, `domain ${domainName}`),
                    {
                      description: args.description,
                      datatype: args.datatype,
                      length: args.length,
                      decimals: args.decimals,
                      conversion_exit: args.conversion_exit,
                      lowercase: args.lowercase,
                      sign_exists: args.sign_exists,
                      value_table: args.value_table,
                      fixed_values: args.fixed_values,
                    },
                  ),
                  lockHandle,
                  analyse: analyseException,
                },
              ),
            () =>
              obj.check({ domainName }, undefined, {
                analyse: analyseException,
              }),
          ),
        (lockHandle) =>
          obj.unlock({ domainName }, lockHandle, { analyse: analyseException }),
      );

      if (!written.ok) {
        return written as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      // Best-effort: wait for the write to be visible before activating.
      // Every outcome is discarded — activation answers explicitly if the
      // object still is not ready.
      await obj
        .readMetadata(
          { domainName },
          { withLongPolling: true, analyse: analyseException },
        )
        .catch(() => undefined);

      if (!shouldActivate) {
        return written;
      }

      return carryCleanup(written, () =>
        obj.activate({ domainName }, { analyse: analyseActivation }),
      );
    },
    project(detail, terseWrite),
  );
}
