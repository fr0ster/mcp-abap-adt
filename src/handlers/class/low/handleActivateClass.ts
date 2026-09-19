/**
 * ActivateClass Handler - Activate ABAP Class
 *
 * Uses AdtClient.getClass().activate from @mcp-abap-adt/adt-clients 19.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateClassLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Activate, Create, Update. Subject: Class. Will be useful for activating, creating, or updating class. [low-level] Activate an ABAP class. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name (e.g., ZCL_MY_CLASS).',
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
    required: ['class_name'],
  },
} as const;

interface ActivateClassArgs {
  class_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateClass(
  context: HandlerContext,
  args: ActivateClassArgs,
) {
  const { connection, logger } = context;
  const { class_name, session_id, session_state } = args;

  if (!class_name) {
    return return_error(new Error('class_name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const className = class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateClassLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getClass(resultsFor(classDocuments))
        .activate({ className }, { analyse: analyseActivation }),
    project(detail, terseActivation),
  );
}
