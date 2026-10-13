/**
 * ActivateMetadataExtensionLow Handler - Activate ABAP Metadata Extension
 *
 * Uses AdtClient.getMetadataExtension().activate from @mcp-abap-adt/adt-clients 19.
 */

import { metadataExtensionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateMetadataExtensionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP metadata extension. Returns activation status and any warnings/errors.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Metadata Extension name.',
      },
      session_id: {
        type: 'string',
        description:
          "Accepted and ignored: every call runs in the instance's own session.",
      },
      session_state: {
        type: 'object',
        description:
          "Accepted and ignored: every call runs in the instance's own session.",
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
      ...DETAIL_PROPERTY,
    },
    required: ['name'],
  },
} as const;

interface ActivateMetadataExtensionArgs {
  name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateMetadataExtension(
  context: HandlerContext,
  args: ActivateMetadataExtensionArgs,
) {
  const { connection, logger } = context;
  const { name } = args;

  if (!name) {
    return return_error(new Error('name is required'));
  }

  const ddlxName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateMetadataExtensionLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getMetadataExtension(resultsFor(metadataExtensionDocuments))
        .activate({ name: ddlxName }, { analyse: analyseActivation }),
    project(detail, terseActivation),
  );
}
