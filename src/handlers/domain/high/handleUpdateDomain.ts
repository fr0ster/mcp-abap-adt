/**
 * UpdateDomain Handler - Update Existing ABAP Domain
 *
 * Uses AdtClient.getDomain().{lock,readMetadata,updateMetadata,unlock,activate}
 * from @mcp-abap-adt/adt-clients 19, through `withLock` — the lock is held
 * for the read-modify-write in its body, and released on every path out
 * (a refused read, a refused write, a thrown patch all still unlock).
 *
 * Workflow: lock -> (read, patch, write) -> unlock -> (activate). The
 * post-write syntax check the pre-migration handler ran (swallowed except
 * for a genuine, non-"already checked" refusal) is gone: it duplicated what
 * `updateMetadata`'s own `analyseException` already verdicts.
 *
 * **The patched document goes in `config.document`, not `options.xmlContent`.**
 * `AdtDomain.updateMetadata()`'s shipped body reads `config.document` only and
 * passes it straight to the PUT body; `options.xmlContent` is declared on the
 * options type but never read by this member. Verified against the compiled
 * `AdtDomain.js` and `core/domain/update.js`, not the declaration file. See
 * `handleUpdateDomain.ts` (low) for the same fix.
 */

import { domainDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { patchDomainXml } from '../../../lib/strategies/domainPatch';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { withLock } from '../../../lib/strategies/withLock';
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
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
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
        () => obj.lock({ domainName }),
        async (
          lockHandle,
        ): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
          const current = await obj.readMetadata(
            { domainName },
            { analyse: analyseException },
          );
          if (!current.ok) {
            return current as IAdtResponse<AdtReading<unknown>, IAdtError>;
          }
          return obj.updateMetadata(
            {
              domainName,
              packageName: args.package_name,
              transportRequest: args.transport_request,
              document: patchDomainXml(
                extractXmlString(
                  current.getResult().value.raw,
                  `domain ${domainName}`,
                ),
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
            },
            { lockHandle, analyse: analyseException },
          );
        },
        (lockHandle) => obj.unlock({ domainName }, lockHandle),
      );

      if (!written.ok || !shouldActivate) {
        return written as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate({ domainName }, { analyse: analyseActivation });
    },
    project(detail, terseWrite),
  );
}
