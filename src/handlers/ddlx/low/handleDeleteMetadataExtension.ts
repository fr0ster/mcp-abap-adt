/**
 * DeleteMetadataExtensionLow Handler - Delete ABAP Metadata Extension
 *
 * Uses AdtClient.getMetadataExtension().delete from @mcp-abap-adt/adt-clients 19.
 */

import { metadataExtensionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseDeletion } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteMetadataExtensionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Delete an ABAP metadata extension from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
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
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
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
          { analyse: analyseDeletion },
        ),
    project(detail, terseDeletion),
  );
}
