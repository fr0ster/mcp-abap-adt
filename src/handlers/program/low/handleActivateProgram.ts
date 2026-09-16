/**
 * ActivateProgramLow Handler - Activate ABAP Program
 *
 * Uses AdtClient.getProgram().activate from @mcp-abap-adt/adt-clients 19.
 */

import { programDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { ourActivation } from '../../../lib/strategies/ourActivation';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import {
  isCloudConnection,
  restoreSessionInConnection,
  return_error,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateProgramLow',
  available_in: ['onprem', 'legacy'] as const,
  description:
    'Operation: Activate, Create, Update. Subject: Program. Will be useful for activating, creating, or updating program. [low-level] Activate an ABAP program. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description: 'Program name (e.g., Z_MY_PROGRAM).',
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
    required: ['program_name'],
  },
} as const;

interface ActivateProgramArgs {
  program_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateProgram(
  context: HandlerContext,
  args: ActivateProgramArgs,
) {
  const { connection, logger } = context;
  const { program_name, session_id, session_state } = args;

  if (!program_name) {
    return return_error(new Error('program_name is required'));
  }

  if (isCloudConnection()) {
    return return_error(
      new Error(
        'Programs are not available on cloud systems (ABAP Cloud). This operation is only supported on on-premise systems.',
      ),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const programName = program_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateProgramLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getProgram(resultsFor(programDocuments))
        .activate({ programName }, { analyse: ourActivation }),
    project(detail, terseActivation),
  );
}
