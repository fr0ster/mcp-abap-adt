/**
 * ActivateDataElement Handler - Activate ABAP Data Element
 *
 * Uses AdtClient.getDataElement().activate from @mcp-abap-adt/adt-clients 19.
 */

import { dataElementDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { ourActivation } from '../../../lib/strategies/ourActivation';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateDataElementLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Activate, Create, Update. Subject: DataElement. Will be useful for activating, creating, or updating data element. [low-level] Activate an ABAP data element. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description: 'Data element name (e.g., ZDT_MY_ELEMENT).',
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
    required: ['data_element_name'],
  },
} as const;

interface ActivateDataElementArgs {
  data_element_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateDataElement(
  context: HandlerContext,
  args: ActivateDataElementArgs,
) {
  const { connection, logger } = context;
  const { data_element_name, session_id, session_state } = args;

  if (!data_element_name) {
    return return_error(new Error('data_element_name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const dataElementName = data_element_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateDataElementLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getDataElement(resultsFor(dataElementDocuments))
        .activate({ dataElementName }, { analyse: ourActivation }),
    project(detail, terseActivation),
  );
}
