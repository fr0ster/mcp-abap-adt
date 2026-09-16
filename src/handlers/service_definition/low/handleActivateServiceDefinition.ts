/**
 * ActivateServiceDefinition Handler - Activate ABAP Service Definition
 *
 * Uses AdtClient.getServiceDefinition().activate from @mcp-abap-adt/adt-clients 19.
 */

import { serviceDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { ourActivation } from '../../../lib/strategies/ourActivation';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateServiceDefinitionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Activate, Create, Update. Subject: ServiceDefinition. Will be useful for activating, creating, or updating service definition. [low-level] Activate an ABAP service definition. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Service definition name (e.g., ZSD_MY_SERVICE).',
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

interface ActivateServiceDefinitionArgs {
  name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateServiceDefinition(
  context: HandlerContext,
  args: ActivateServiceDefinitionArgs,
) {
  const { connection, logger } = context;
  const { name, session_id, session_state } = args;

  if (!name) {
    return return_error(new Error('name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const serviceDefinitionName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateServiceDefinitionLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getServiceDefinition(resultsFor(serviceDefinitionDocuments))
        .activate({ serviceDefinitionName }, { analyse: ourActivation }),
    project(detail, terseActivation),
  );
}
