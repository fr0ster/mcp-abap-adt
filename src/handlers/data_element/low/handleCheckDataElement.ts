/**
 * CheckDataElement Handler - Syntax check for ABAP Data Element
 *
 * Uses AdtClient.getDataElement().check from @mcp-abap-adt/adt-clients 19.
 */

import { dataElementDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckDataElementLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP data element. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description: 'DataElement name (e.g., Z_MY_PROGRAM).',
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

interface CheckDataElementArgs {
  data_element_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckDataElement(
  context: HandlerContext,
  args: CheckDataElementArgs,
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
    { tool: 'CheckDataElementLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getDataElement(resultsFor(dataElementDocuments))
        // `status` left undefined: the shipped default checks the inactive
        // version, which is what a caller wants right after a write —
        // `AdtDataElement.check`'s own `status === 'active' ? 'active' :
        // 'inactive'` reduces an undefined status to 'inactive'.
        .check({ dataElementName }, undefined, { analyse: analyseException }),
    project(detail, terseCheck),
  );
}
