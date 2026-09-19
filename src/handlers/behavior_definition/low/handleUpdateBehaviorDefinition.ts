/**
 * UpdateBehaviorDefinition Handler - Update ABAP Behavior Definition Source Code
 *
 * Uses AdtClient.getBehaviorDefinition().update from @mcp-abap-adt/adt-clients 19.
 *
 * **The source goes in `options`, not `config`.**
 * `IBehaviorDefinitionConfig` still declares a `sourceCode` field, so
 * `update({ name, sourceCode }, ...)` compiles either way — but the shipped
 * `AdtBehaviorDefinition.update()` reads `options?.sourceCode` only (its own
 * comment: "This used to fall back to `config.sourceCode` — two channels
 * for one value, where the contract documents one"). `transportRequest`
 * stays in `config` — the same member reads `config.transportRequest`
 * directly. A `.d.ts` comment is not evidence for where a value lands; the
 * compiled JavaScript is. Verified against `AdtBehaviorDefinition.js`, not
 * the declaration file.
 */

import { behaviorDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateBehaviorDefinitionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Update source code of an existing ABAP behavior definition. Requires lock handle from LockObject. - use UpdateBehaviorDefinition (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description:
          'Behavior definition name (e.g., ZOK_C_TEST_0001). Behavior definition must already exist.',
      },
      source_code: {
        type: 'string',
        description: 'Complete behavior definition source code.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockObject. Required for update operation.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages).',
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
    required: ['name', 'source_code', 'lock_handle'],
  },
} as const;

interface UpdateBehaviorDefinitionArgs {
  name: string;
  source_code: string;
  lock_handle: string;
  transport_request?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateBehaviorDefinition(
  context: HandlerContext,
  args: UpdateBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;
  const {
    name,
    source_code,
    lock_handle,
    transport_request,
    session_id,
    session_state,
  } = args;

  if (!name || !source_code || !lock_handle) {
    return return_error(
      new Error('name, source_code, and lock_handle are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const bdefName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateBehaviorDefinitionLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
        .update(
          {
            name: bdefName,
            transportRequest: transport_request,
          },
          {
            sourceCode: source_code,
            lockHandle: lock_handle,
            analyse: analyseException,
          },
        ),
    project(detail, terseWrite),
  );
}
