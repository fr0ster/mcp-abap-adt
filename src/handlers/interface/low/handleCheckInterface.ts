/**
 * CheckInterface Handler - Syntax check for ABAP Interface
 *
 * Uses AdtClient.getInterface().check from @mcp-abap-adt/adt-clients 19.
 */

import { interfaceDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseCheck } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckInterfaceLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP interface. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      interface_name: {
        type: 'string',
        description: 'Interface name (e.g., Z_MY_PROGRAM).',
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

interface CheckInterfaceArgs {
  interface_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckInterface(
  context: HandlerContext,
  args: CheckInterfaceArgs,
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
    { tool: 'CheckInterfaceLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getInterface(resultsFor(interfaceDocuments))
        // `status` left undefined: the shipped default checks the inactive
        // version, which is what a caller wants right after a write.
        .check({ interfaceName }, undefined, { analyse: analyseCheck }),
    project(detail, terseCheck),
  );
}
