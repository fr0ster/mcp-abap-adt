/**
 * DeleteTableType Handler - Delete an ABAP Table Type via the ADT deletion API
 *
 * As `DeleteDomain`: the deletion check first, the delete only if it
 * permits (`deleteIfDeletable`), no lock — a held lock is what makes ADT
 * refuse. A refusal answers 200 inside the document, which `analyseDeletion`
 * reads rather than the status.
 */

import { tableTypeDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { deleteIfDeletable } from '../../../lib/strategies/checkedDeletion';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteTableType',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Deletes the ABAP table type named by table_type_name through the ADT deletion service, after asking whether it can be deleted. Returns the deletion result.',
  inputSchema: {
    type: 'object',
    properties: {
      table_type_name: {
        type: 'string',
        description: 'Table type name.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number, not a task. Required for transportable objects. Optional for local objects.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['table_type_name'],
  },
} as const;

/** What the caller sent: arguments from outside the type system, so a
 * required one may be absent and is refused below. */
interface DeleteTableTypeArgs {
  table_type_name?: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteTableType(
  context: HandlerContext,
  args: DeleteTableTypeArgs,
) {
  const { connection, logger } = context;

  if (!args.table_type_name) {
    return return_error(new Error('table_type_name is required'));
  }

  const tableTypeName = args.table_type_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteTableType', detail },
    () =>
      deleteIfDeletable(
        context,
        'tableType',
        createAdtClient(connection, logger).getTableType(
          resultsFor(tableTypeDocuments),
        ),
        { tableTypeName, transportRequest: args.transport_request },
      ),
    project(detail, terseDeletion),
  );
}
