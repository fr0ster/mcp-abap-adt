/**
 * CheckProgramLow Handler - Syntax check for ABAP Program
 *
 * Uses AdtClient.getProgram().check from @mcp-abap-adt/adt-clients 19.
 *
 * **No `version` parameter on this tool, so `status` is always `undefined`.**
 * The shipped `check(config, status, options)` reads `status === 'active' ?
 * 'active' : 'inactive'`, so an omitted status checks the inactive version —
 * the same shipped default `CheckDomainLow`/`CheckTableLow` rely on. Unlike
 * those two, `checkProgram(connection, config.programName, version,
 * config.sourceCode, contentType)` DOES read a fourth argument for an
 * unsaved source, but no `source_code` parameter existed on this tool before
 * this migration, so nothing is forwarded there either. Verified against
 * `AdtProgram.js`, not the declaration file.
 */

import { programDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseCheck } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import {
  isCloudConnection,
  restoreSessionInConnection,
  return_error,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckProgramLow',
  available_in: ['onprem', 'legacy'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP program. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.',
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

interface CheckProgramArgs {
  program_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckProgram(
  context: HandlerContext,
  args: CheckProgramArgs,
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
    { tool: 'CheckProgramLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getProgram(resultsFor(programDocuments))
        // `status` left undefined: the shipped default checks the inactive
        // version, and there is no `version` parameter on this tool to say
        // otherwise.
        .check({ programName }, undefined, { analyse: analyseCheck }),
    project(detail, terseCheck),
  );
}
