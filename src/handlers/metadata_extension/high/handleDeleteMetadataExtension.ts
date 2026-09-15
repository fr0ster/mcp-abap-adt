/**
 * DeleteMetadataExtension Handler - Delete ABAP MetadataExtension via its
 * own URL
 *
 * Uses AdtClient.getMetadataExtension().delete from
 * @mcp-abap-adt/adt-clients 19.
 *
 * **Not a deletion-service call.** Confirmed against
 * `AdtMetadataExtension.d.ts`'s own comment ("Its delete is a DELETE on its
 * own URL rather than the deletion service") and `delete.js`: `delete()`
 * issues a plain `DELETE /sap/bc/adt/ddic/ddlx/sources/{name}`, not a POST
 * to `/sap/bc/adt/deletion/delete`. That endpoint answers no
 * `del:deletionResult`/`del:checkResponse` document — `terseDeletion` would
 * find no `del:object` in an empty body and mask every success as a local
 * `projection_failed`, the same defect class task 20 found in two handlers
 * and this task's own fix round found here. Fixed the same way the four
 * class-include deletes are: `analyseException` (an empty-body 2xx has
 * nothing for `analyseDeletion`'s document read to find either, but
 * `analyseException` names what the endpoint actually is) and `terseWrite`,
 * a status-derived projection. No lock: the wire function takes no
 * `lockHandle`.
 *
 * The low-tier sibling, `ddlx/low/handleDeleteMetadataExtension.ts`, shares
 * this object and the same pre-fix defect; fixed alongside this file.
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
  name: 'DeleteMetadataExtension',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete an ABAP metadata extension from the SAP system. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      metadata_extension_name: {
        type: 'string',
        description: 'MetadataExtension name (e.g., Z_MY_METADATAEXTENSION).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['metadata_extension_name'],
  },
} as const;

interface DeleteMetadataExtensionArgs {
  metadata_extension_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteMetadataExtension(
  context: HandlerContext,
  args: DeleteMetadataExtensionArgs,
) {
  const { connection, logger } = context;
  const { metadata_extension_name, transport_request } = args;

  if (!metadata_extension_name) {
    return return_error(new Error('metadata_extension_name is required'));
  }

  const name = metadata_extension_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteMetadataExtension', detail },
    () =>
      createAdtClient(connection, logger)
        .getMetadataExtension(resultsFor(metadataExtensionDocuments))
        .delete(
          { name, transportRequest: transport_request },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
