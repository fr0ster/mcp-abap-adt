/**
 * DeleteMetadataExtension Handler - Delete ABAP MetadataExtension via ADT
 * deletion API
 *
 * Uses AdtClient.getMetadataExtension().delete from
 * @mcp-abap-adt/adt-clients 19. See `handleDeleteDomain.ts` for the shape and
 * the masking this follows: a refusal answers 200, `analyseDeletion` reads
 * it rather than the status, and no lock is taken because a held lock is
 * what makes ADT refuse.
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
  name: 'DeleteMetadataExtension',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete an ABAP metadata extension from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
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
          { analyse: analyseDeletion },
        ),
    project(detail, terseDeletion),
  );
}
