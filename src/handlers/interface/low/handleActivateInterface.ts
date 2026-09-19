/**
 * ActivateInterface Handler - Activate ABAP Interface
 *
 * Uses AdtClient.getInterface().activate from @mcp-abap-adt/adt-clients 19.
 */

import { interfaceDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateInterfaceLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Activate, Create, Update. Subject: Interface. Will be useful for activating, creating, or updating interface. [low-level] Activate an ABAP interface. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      interface_name: {
        type: 'string',
        description: 'Interface name (e.g., ZIF_MY_INTERFACE).',
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
    required: ['interface_name'],
  },
} as const;

interface ActivateInterfaceArgs {
  interface_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateInterface(
  context: HandlerContext,
  args: ActivateInterfaceArgs,
) {
  const { connection, logger } = context;
  const { interface_name, session_id, session_state } = args;

  if (!interface_name) {
    return return_error(new Error('interface_name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const interfaceName = interface_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateInterfaceLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getInterface(resultsFor(interfaceDocuments))
        .activate({ interfaceName }, { analyse: analyseActivation }),
    project(detail, terseActivation),
  );
}
