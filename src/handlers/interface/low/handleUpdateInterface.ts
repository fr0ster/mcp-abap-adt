/**
 * UpdateInterface Handler - Update ABAP Interface Source Code
 *
 * Uses AdtClient.getInterface().update from @mcp-abap-adt/adt-clients 19.
 *
 * **The source goes in `options`, not `config`.** `IInterfaceConfig` still
 * declares a `source` field, so `update({ interfaceName, source },
 * ...)` compiles either way — but the shipped `AdtInterface.update()` reads
 * `options?.source` only (its own comment: "This used to fall back to
 * `config.source` — two channels for one value, where the contract
 * documents one"). A `.d.ts` comment is not evidence for where a value
 * lands; the compiled JavaScript is. Verified against `AdtInterface.js`, not
 * the declaration file.
 */

import { interfaceDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateInterfaceLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Update source code of an existing ABAP interface. Requires lock handle from LockObject. - use UpdateInterface (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: {
    type: 'object',
    properties: {
      interface_name: {
        type: 'string',
        description:
          'Interface name (e.g., ZIF_TEST_INTERFACE). Interface must already exist.',
      },
      source_code: {
        type: 'string',
        description: 'Complete ABAP interface source code.',
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
    required: ['interface_name', 'source_code', 'lock_handle'],
  },
} as const;

interface UpdateInterfaceArgs {
  interface_name: string;
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

export async function handleUpdateInterface(
  context: HandlerContext,
  args: UpdateInterfaceArgs,
) {
  const { connection, logger } = context;
  const {
    interface_name,
    source_code,
    lock_handle,
    session_id,
    session_state,
  } = args;

  if (!interface_name || !source_code || !lock_handle) {
    return return_error(
      new Error('interface_name, source_code, and lock_handle are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const interfaceName = interface_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateInterfaceLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getInterface(resultsFor(interfaceDocuments))
        .update(
          { interfaceName },
          {
            source: source_code,
            lockHandle: lock_handle,
            analyse: analyseException,
          },
        ),
    project(detail, terseWrite),
  );
}
