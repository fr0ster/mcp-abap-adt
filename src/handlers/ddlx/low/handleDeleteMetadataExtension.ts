/**
 * DeleteMetadataExtensionLow Handler - Delete ABAP Metadata Extension via
 * its own URL
 *
 * Uses AdtClient.getMetadataExtension().delete from @mcp-abap-adt/adt-clients 19.
 *
 * **Not a deletion-service call — see
 * `metadata_extension/high/handleDeleteMetadataExtension.ts`'s own doc
 * comment for the full finding.** `AdtMetadataExtension.delete()` issues a
 * plain `DELETE /sap/bc/adt/ddic/ddlx/sources/{name}`, never a POST to
 * `/sap/bc/adt/deletion/delete`, so it answers no `del:deletionResult`
 * document for `terseDeletion` to project — every success was masked as a
 * local `projection_failed`. Fixed here the same way: `analyseException`
 * and the status-derived `terseWrite`, sharing the object and the defect
 * with the high-tier sibling above.
 */

import { metadataExtensionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteMetadataExtensionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Delete an ABAP metadata extension from the SAP system. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'MetadataExtension name (e.g., ZI_MY_DDLX).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP). A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['name'],
  },
} as const;

interface DeleteMetadataExtensionArgs {
  name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteMetadataExtension(
  context: HandlerContext,
  args: DeleteMetadataExtensionArgs,
) {
  const { connection, logger } = context;
  const { name, transport_request } = args;

  if (!name) {
    return return_error(new Error('name is required'));
  }

  const ddlxName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteMetadataExtensionLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getMetadataExtension(resultsFor(metadataExtensionDocuments))
        .delete(
          { name: ddlxName, transportRequest: transport_request },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
