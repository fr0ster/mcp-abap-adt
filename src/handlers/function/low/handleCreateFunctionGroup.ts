/**
 * CreateFunctionGroupLow Handler - Create ABAP Function Group
 *
 * Uses AdtClient.getFunctionGroup().create from @mcp-abap-adt/adt-clients 19.
 *
 * A create is one request, and its own answer: `resultSets.ts` maps the
 * `created` slot to `verbatim`, so `project(detail, terseWrite)` still reads
 * the status for `terse` while `full`/`raw` answer the document ADT sent
 * instead of discarding it.
 *
 * **`packageName` is required by the member itself, not only by this tool.**
 * `AdtFunctionGroup.create()` throws before issuing a request when
 * `config.packageName` is missing — a function group created without one
 * cannot be deleted through ADT (the deletion check resolves through the
 * package). `description` reaches the wire; there is no source to send here
 * — a function group is a container, and `LockFunctionModuleLow`/
 * `UpdateFunctionModuleLow` add the members that carry source. Verified
 * against `AdtFunctionGroup.js`.
 *
 * **A pre-migration compensation was dropped here, deliberately.** The old
 * handler special-cased ADT's 400 for "Interface SAPL* ... has not been
 * created" by re-reading the object and reporting success anyway — a genuine
 * masking of a refusal ADT never softened into a 200. This handler now
 * reports that 400 as the refusal it is. The high-tier `CreateFunctionGroup`
 * still does the equivalent for two other 400 messages ("Kerberos library
 * not loaded", "Business partner does not exist"), without even the
 * read-back this low handler used to have — an inconsistency this task did
 * not introduce and does not have in scope to fix, since it sits one
 * directory over.
 */

import { functionGroupDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateFunctionGroupLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Create a new ABAP function group. - use CreateFunctionGroup (high-level) for full workflow with validation, lock, update, check, unlock, and activate.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description:
          'Function group name (e.g., ZFG_MY_GROUP). Must follow SAP naming conventions.',
      },
      description: {
        type: 'string',
        description: 'Function group description.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects).',
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
    required: ['function_group_name', 'description', 'package_name'],
  },
} as const;

interface CreateFunctionGroupArgs {
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

export async function handleCreateFunctionGroup(
  context: HandlerContext,
  args: CreateFunctionGroupArgs,
) {
  const { connection, logger } = context;
  const {
    function_group_name,
    description,
    package_name,
    transport_request,
    session_id,
    session_state,
  } = args;

  if (!function_group_name || !description || !package_name) {
    return return_error(
      new Error(
        'function_group_name, description, and package_name are required',
      ),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const functionGroupName = function_group_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateFunctionGroupLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getFunctionGroup(resultsFor(functionGroupDocuments))
        .create(
          {
            functionGroupName,
            description,
            packageName: package_name,
            transportRequest: transport_request,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
