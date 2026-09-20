/**
 * ValidateMetadataExtensionLow Handler - Validate ABAP Metadata Extension Name
 *
 * Uses AdtClient.getMetadataExtension().validate from @mcp-abap-adt/adt-clients 19.
 */

import { metadataExtensionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseValidation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ValidateMetadataExtensionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Validate an ABAP metadata extension name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Metadata Extension name to validate (e.g., ZI_MY_DDLX).',
      },
      package_name: {
        type: 'string',
        description:
          'Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.',
      },
      description: {
        type: 'string',
        description: 'Metadata Extension description. Required for validation.',
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
    required: ['name', 'package_name', 'description'],
  },
} as const;

interface ValidateMetadataExtensionArgs {
  name: string;
  package_name: string;
  description: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleValidateMetadataExtension(
  context: HandlerContext,
  args: ValidateMetadataExtensionArgs,
) {
  const { connection, logger } = context;
  const { name, package_name, description, session_id, session_state } = args;

  if (!name || !package_name || !description) {
    return return_error(
      new Error('name, package_name, and description are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const ddlxName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ValidateMetadataExtensionLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getMetadataExtension(resultsFor(metadataExtensionDocuments))
        .validate(
          {
            name: ddlxName,
            description,
            packageName: package_name.toUpperCase(),
          },
          { analyse: analyseException },
        ),
    project(detail, terseValidation),
  );
}
