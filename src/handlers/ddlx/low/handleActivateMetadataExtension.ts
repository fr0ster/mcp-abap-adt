/**
 * ActivateMetadataExtensionLow Handler - Activate ABAP Metadata Extension
 *
 * Uses AdtClient.getMetadataExtension().activate from @mcp-abap-adt/adt-clients 19.
 */

import { metadataExtensionDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { ourActivation } from '../../../lib/strategies/ourActivation';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateMetadataExtensionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Activate, Create, Update. Subject: Metadata Extension. Will be useful for activating, creating, or updating a metadata extension. [low-level] Activate an ABAP metadata extension. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Metadata Extension name (e.g., ZI_MY_DDLX).',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
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
  const { name, session_id, session_state } = args;

  if (!name) {
    return return_error(new Error('name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const ddlxName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateMetadataExtensionLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getMetadataExtension(resultsFor(metadataExtensionDocuments))
        .activate({ name: ddlxName }, { analyse: ourActivation }),
    project(detail, terseActivation),
  );
}
