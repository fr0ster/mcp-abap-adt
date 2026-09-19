/**
 * ActivateServiceBinding Handler - Activate ABAP Service Binding
 *
 * Uses AdtClient.getServiceBinding().activate from @mcp-abap-adt/adt-clients 19.
 *
 * `getServiceBinding()` is `AdtServiceBinding`, declared over `serviceDocuments`
 * (the same result-set shape `AdtService` — the OData-publication subclass —
 * shares), and its `activate(config, options)` reads `config.bindingName`.
 */

import { serviceDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateServiceBindingLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Activate, Create, Update. Subject: ServiceBinding. Will be useful for activating, creating, or updating service binding. [low-level] Activate an ABAP service binding. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Service binding name (e.g., ZSB_MY_SERVICE).',
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

interface ActivateServiceBindingArgs {
  name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateServiceBinding(
  context: HandlerContext,
  args: ActivateServiceBindingArgs,
) {
  const { connection, logger } = context;
  const { name, session_id, session_state } = args;

  if (!name) {
    return return_error(new Error('name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const bindingName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateServiceBindingLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getServiceBinding(resultsFor(serviceDocuments))
        .activate({ bindingName }, { analyse: analyseActivation }),
    project(detail, terseActivation),
  );
}
