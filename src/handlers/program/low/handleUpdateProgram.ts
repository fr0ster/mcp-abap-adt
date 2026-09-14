/**
 * UpdateProgramLow Handler - Update ABAP Program Source Code
 *
 * Uses AdtClient.getProgram().update from @mcp-abap-adt/adt-clients 19.
 *
 * **The source goes through `options.sourceCode`.** `AdtProgram.update()`'s
 * shipped body reads `const source = options?.sourceCode;` only — the
 * `config.sourceCode` fallback other members used to have is gone, and
 * `config.sourceCode` is `check()`'s alone now (an unsaved source to check,
 * not one to write). This handler writes through `options` only, the one
 * channel every sibling family in this cluster shares. No `transport_request`
 * parameter existed on this tool before this migration, so none is forwarded
 * to `config.transportRequest` either. Verified against `AdtProgram.js`, not
 * the declaration file.
 */

import { programDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateProgramLow',
  available_in: ['onprem', 'legacy'] as const,
  description:
    '[low-level] Update source code of an existing ABAP program. Requires lock handle from LockObject. - use UpdateProgram (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description:
          'Program name (e.g., Z_TEST_PROGRAM). Program must already exist.',
      },
      source_code: {
        type: 'string',
        description: 'Complete ABAP program source code.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockObject. Required for update operation.',
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
    required: ['program_name', 'source_code', 'lock_handle'],
  },
} as const;

interface UpdateProgramArgs {
  program_name: string;
  source_code: string;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateProgram(
  context: HandlerContext,
  args: UpdateProgramArgs,
) {
  const { connection, logger } = context;
  const { program_name, source_code, lock_handle, session_id, session_state } =
    args;

  if (!program_name || !source_code || !lock_handle) {
    return return_error(
      new Error('program_name, source_code, and lock_handle are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const programName = program_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateProgramLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getProgram(resultsFor(programDocuments))
        .update(
          { programName },
          {
            sourceCode: source_code,
            lockHandle: lock_handle,
            analyse: analyseException,
          },
        ),
    project(detail, terseWrite),
  );
}
