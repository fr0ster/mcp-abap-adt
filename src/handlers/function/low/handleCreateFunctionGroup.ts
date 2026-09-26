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
 * **The read-back on ADT's interface 400 is kept, and it is not masking.**
 * Creating a function group can answer `400` with "Interface SAPL… has not
 * been created" while the group itself is there. The pre-migration handler
 * answered that by reading the object back and, only if it read, reporting
 * success. A migration pass removed it as "masking a refusal" — which it is
 * not: masking is claiming success without looking, and this looks. Removing
 * it made a create that had worked report failure, so it is back.
 *
 * `read()` no longer exists on the 19 contract for a function group — a
 * group has no source of its own — so the read-back is `readMetadata()`,
 * the same call `GetFunctionGroup` and `ReadFunctionGroup` make.
 *
 * Every other 400 is still the refusal it is: this branch is entered only
 * for that one message, and only after the create has already failed.
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
          'Transport request number (e.g., E19K905635). Required for transportable packages. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
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
    async () => {
      const obj = createAdtClient(connection, logger).getFunctionGroup(
        resultsFor(functionGroupDocuments),
      );

      const created = await obj.create(
        {
          functionGroupName,
          description,
          packageName: package_name,
          transportRequest: transport_request,
        },
        { analyse: analyseException },
      );

      if (created.ok || !isInterfaceNotCreated(created.getError())) {
        return created;
      }

      // ADT said no and made the object anyway. Ask it, rather than believe
      // either answer on its own.
      logger?.warn(
        `CreateFunctionGroup answered the interface 400 for ${functionGroupName}; reading it back to see whether it exists`,
      );
      const readBack = await obj.readMetadata(
        { functionGroupName },
        { analyse: analyseException },
      );
      if (!readBack.ok) {
        // It really did not happen: the create's own refusal, not the read's.
        return created;
      }
      logger?.info(
        `CreateFunctionGroup: ${functionGroupName} reads back, so the create landed`,
      );
      return readBack as unknown as typeof created;
    },
    project(detail, terseWrite),
  );
}

/**
 * ADT's one refusal that can accompany a successful create.
 *
 * Matched on the message because that is where ADT puts it — the status is
 * 400 for a dozen unrelated reasons, and the `exc:exception` type id is the
 * generic one. Both fragments are required so that a message mentioning only
 * one of them does not trigger a read-back that would answer a different
 * question.
 */
function isInterfaceNotCreated(error: { message?: string }): boolean {
  const message = error?.message ?? '';
  return (
    message.includes('Interface SAPL') &&
    message.includes('has not been created')
  );
}
