/**
 * UpdateProgramLow Handler - Update ABAP Program Source Code
 *
 * Uses AdtClient.getProgram().update from @mcp-abap-adt/adt-clients 19.
 *
 * **The source goes through `options.source`.** `AdtProgram.update()`'s
 * shipped body reads `const source = options?.source;` only — the
 * `config.source` fallback other members used to have is gone, and
 * `config.source` is `check()`'s alone now (an unsaved source to check,
 * not one to write). This handler writes through `options` only, the one
 * channel every sibling family in this cluster shares. `transport_request`
 * goes to `config.transportRequest`, which `uploadProgramSource` puts on the
 * URL as `corrNr` — without it a write into a transportable package is
 * refused on premise ("Parameter corrNr could not be found.", E19
 * 2026-09-25, measured on a view; the same member shape here). Verified
 * against `AdtProgram.js`, not the declaration file.
 */

import { programDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import {
  isCloudConnection,
  restoreSessionInConnection,
  return_error,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateProgramLow',
  available_in: ['onprem'] as const,
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
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages): it travels as corrNr on the write, and without it an on-premise system answers "Parameter corrNr could not be found." (SADT_RESOURCE 017). A REQUEST number, not a task.',
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
  transport_request?: string;
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
    { tool: 'UpdateProgramLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getProgram(resultsFor(programDocuments))
        .update(
          {
            programName,
            ...(args.transport_request && {
              transportRequest: args.transport_request,
            }),
          },
          {
            source: source_code,
            lockHandle: lock_handle,
            analyse: analyseException,
          },
        ),
    project(detail, terseWrite),
  );
}
