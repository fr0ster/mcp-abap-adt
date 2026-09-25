/**
 * UpdateFunctionModuleLow Handler - Update ABAP Function Module Source Code
 *
 * Uses AdtClient.getFunctionModule().update from @mcp-abap-adt/adt-clients 19.
 *
 * **The source goes through `options.source`.** `AdtFunctionModule.update()`'s
 * shipped body reads `const source = options?.source;` only, and passes
 * `config.transportRequest` straight through. This handler writes through
 * `options` only, the one channel every sibling family in this cluster
 * shares. Verified against `AdtFunctionModule.js`.
 */

import { functionModuleDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateFunctionModuleLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Update source code of an existing ABAP function module. Requires lock handle from LockObject and function group name. - use UpdateFunctionModule (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: {
    type: 'object',
    properties: {
      function_module_name: {
        type: 'string',
        description:
          'Function module name (e.g., Z_TEST_FM). Function module must already exist.',
      },
      function_group_name: {
        type: 'string',
        description:
          'Function group name containing the function module (e.g., Z_TEST_FG).',
      },
      source_code: {
        type: 'string',
        description: 'Complete ABAP function module source code.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects locked in a request. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockFunctionModule. Required for update operation.',
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
    required: [
      'function_module_name',
      'function_group_name',
      'source_code',
      'lock_handle',
    ],
  },
} as const;

interface UpdateFunctionModuleArgs {
  function_module_name: string;
  function_group_name: string;
  source_code: string;
  transport_request?: string;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateFunctionModule(
  context: HandlerContext,
  args: UpdateFunctionModuleArgs,
) {
  const { connection, logger } = context;
  const {
    function_module_name,
    function_group_name,
    source_code,
    transport_request,
    lock_handle,
    session_id,
    session_state,
  } = args;

  if (
    !function_module_name ||
    !function_group_name ||
    !source_code ||
    !lock_handle
  ) {
    return return_error(
      new Error(
        'function_module_name, function_group_name, source_code, and lock_handle are required',
      ),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const functionModuleName = function_module_name.toUpperCase();
  const functionGroupName = function_group_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateFunctionModuleLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getFunctionModule(resultsFor(functionModuleDocuments))
        .update(
          {
            functionModuleName,
            functionGroupName,
            transportRequest: transport_request,
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
