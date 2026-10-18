/**
 * UpdateDdlLow Handler - Update ABAP DDL Source
 *
 * Uses AdtClient.getDdl().update from @mcp-abap-adt/adt-clients 19.
 *
 * **The source goes through `options.source`.** Unlike `AdtInterface` or
 * `AdtMetadataExtension`, `AdtDdl.update()`'s shipped body does keep a
 * fallback — `const source = options?.source || config.source` — but
 * this handler writes through `options` only, the one channel every sibling
 * family in this cluster shares, and never puts a source string on `config`.
 * Verified against `AdtDdl.js`, not the declaration file.
 */

import { ddlDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateDdlLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Update DDL source code of an existing CDS View or Classic View. Requires lock handle from LockDdlLow. - use UpdateDdl (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name. DDL source must already exist.',
      },
      ddl_source: {
        type: 'string',
        description:
          "Complete DDL source code. CDS: include @AbapCatalog.sqlViewName and other annotations. Classic: plain 'define view' statement.",
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockDdlLow. Required for update operation.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages), not a task.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['ddl_name', 'ddl_source', 'lock_handle'],
  },
} as const;

interface UpdateDdlArgs {
  ddl_name: string;
  ddl_source: string;
  lock_handle: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateDdl(
  context: HandlerContext,
  args: UpdateDdlArgs,
) {
  const { connection, logger } = context;
  const { ddl_name, ddl_source, lock_handle } = args;

  if (!ddl_name || !ddl_source || !lock_handle) {
    return return_error(
      new Error('ddl_name, ddl_source, and lock_handle are required'),
    );
  }

  const ddlName = ddl_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateDdlLow', detail },
    () =>
      withAdtHeaders(context, 'ddl.update', (headers) =>
        createAdtClient(connection, logger)
          .getDdl(resultsFor(ddlDocuments))
          .update(
            {
              ddlName,
              ...(args.transport_request && {
                transportRequest: args.transport_request,
              }),
            },
            {
              headers,
              source: ddl_source,
              lockHandle: lock_handle,
              analyse: analyseException,
            },
          ),
      ),
    project(detail, terseWrite),
  );
}
