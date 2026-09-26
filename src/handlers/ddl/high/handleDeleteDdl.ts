/**
 * DeleteDdl Handler - Delete ABAP DDL Source via ADT deletion API
 *
 * Uses AdtClient.getDdl().delete from @mcp-abap-adt/adt-clients 19. See
 * `handleDeleteDomain.ts` for the shape and the masking this follows: a
 * refusal answers 200, `analyseDeletion` reads it rather than the status,
 * and no lock is taken because a held lock is what makes ADT refuse.
 */

import { ddlDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { deleteIfDeletable } from '../../../lib/strategies/checkedDeletion';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteDdl',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete a DDL source from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name (e.g., Z_MY_VIEW).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP). A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['ddl_name'],
  },
} as const;

interface DeleteDdlArgs {
  ddl_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteDdl(
  context: HandlerContext,
  args: DeleteDdlArgs,
) {
  const { connection, logger } = context;
  const { ddl_name, transport_request } = args;

  if (!ddl_name) {
    return return_error(new Error('ddl_name is required'));
  }

  const ddlName = ddl_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteDdl', detail },
    () =>
      deleteIfDeletable(
        createAdtClient(connection, logger).getDdl(resultsFor(ddlDocuments)),
        { ddlName, transportRequest: transport_request },
      ),
    project(detail, terseDeletion),
  );
}
