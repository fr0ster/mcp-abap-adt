/**
 * CheckMetadataExtensionLow Handler - Syntax check for ABAP Metadata Extension
 *
 * Uses AdtClient.getMetadataExtension().check from @mcp-abap-adt/adt-clients 19.
 *
 * `status` left undefined: the shipped default checks the inactive version,
 * which is what a caller wants right after a write. `checkMetadataExtension`
 * also takes no source parameter at all — unlike ddl/structure, there is no
 * unsaved-code check here to forward.
 */

import { metadataExtensionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckMetadataExtensionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP metadata extension. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'MetadataExtension name (e.g., ZI_MY_DDLX).',
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

interface CheckMetadataExtensionArgs {
  name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckMetadataExtension(
  context: HandlerContext,
  args: CheckMetadataExtensionArgs,
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
    { tool: 'CheckMetadataExtensionLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getMetadataExtension(resultsFor(metadataExtensionDocuments))
        .check({ name: ddlxName }, undefined, { analyse: analyseException }),
    project(detail, terseCheck),
  );
}
