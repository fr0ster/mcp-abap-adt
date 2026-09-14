/**
 * CreateFunctionModuleLow Handler - Create ABAP Function Module
 *
 * Uses AdtClient.getFunctionModule().create from @mcp-abap-adt/adt-clients 19.
 *
 * A create is one request, and its own answer: `resultSets.ts` maps the
 * `created` slot to `verbatim`, so `project(detail, terseWrite)` still reads
 * the status for `terse` while `full`/`raw` answer the document ADT sent
 * instead of discarding it.
 *
 * **`package_name` reaches nothing.** The shipped `AdtFunctionModule.create()`
 * reads `functionGroupName`, `functionModuleName`, `transportRequest`,
 * `description`, `masterSystem` and `responsible` — a function module lives
 * inside its group's package, and `ICreateFunctionModuleParams` has no
 * `packageName` field at all. Kept on the tool schema, required, for
 * compatibility (removing an existing parameter is not this migration's
 * job), but never forwarded. Verified against `AdtFunctionModule.js`.
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
  name: 'CreateFunctionModuleLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Create a new ABAP function module. - use CreateFunctionModule (high-level) for full workflow with validation, lock, update, check, unlock, and activate.',
  inputSchema: {
    type: 'object',
    properties: {
      function_module_name: {
        type: 'string',
        description: 'Function module name (e.g., Z_MY_FUNCTION).',
      },
      function_group_name: {
        type: 'string',
        description: 'Function group name (e.g., ZFG_MY_GROUP).',
      },
      description: {
        type: 'string',
        description: 'Function module description.',
      },
      package_name: {
        type: 'string',
        description:
          "Accepted for compatibility; not sent to the server. A function module lives inside its function group's package — the shipped create endpoint takes no package of its own.",
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
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
      'description',
      'package_name',
    ],
  },
} as const;

interface CreateFunctionModuleArgs {
  function_module_name: string;
  function_group_name: string;
  description: string;
  package_name: string;
  transport_request?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateFunctionModule(
  context: HandlerContext,
  args: CreateFunctionModuleArgs,
) {
  const { connection, logger } = context;
  const {
    function_module_name,
    function_group_name,
    description,
    package_name,
    transport_request,
    session_id,
    session_state,
  } = args;

  if (
    !function_module_name ||
    !function_group_name ||
    !description ||
    !package_name
  ) {
    return return_error(
      new Error(
        'function_module_name, function_group_name, description, and package_name are required',
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
    { tool: 'CreateFunctionModuleLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getFunctionModule(resultsFor(functionModuleDocuments))
        .create(
          {
            functionModuleName,
            functionGroupName,
            description,
            transportRequest: transport_request,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
