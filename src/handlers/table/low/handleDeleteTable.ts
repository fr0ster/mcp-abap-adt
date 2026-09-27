/**
 * DeleteTableLow Handler - Delete ABAP Table
 *
 * Uses AdtClient.getTable().delete from @mcp-abap-adt/adt-clients 19.
 */

import { tableDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { analyseDeletion } from '../../../lib/strategies/deletionRefusal';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteTableLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Delete a table from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      table_name: {
        type: 'string',
        description: 'Table name (e.g., Z_MY_TABLE).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP). A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['table_name'],
  },
} as const;

interface DeleteTableArgs {
  table_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteTable(
  context: HandlerContext,
  args: DeleteTableArgs,
) {
  const { connection, logger } = context;
  const { table_name, transport_request } = args;

  if (!table_name) {
    return return_error(new Error('table_name is required'));
  }

  const tableName = table_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteTableLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getTable(resultsFor(tableDocuments))
        .delete(
          { tableName, transportRequest: transport_request },
          { analyse: analyseDeletion },
        ),
    project(detail, terseDeletion),
  );
}
