/**
 * UpdateFunctionInclude Handler - Write a function group include's source
 *
 * Uses AdtClient.getFunctionInclude().update from @mcp-abap-adt/adt-clients 19.
 *
 * **This handler holds no lock — it takes the caller's lock handle as an
 * argument.** `update()` reads `options?.lockHandle` and issues one PUT;
 * there is no internal lock/unlock (the pre-migration handler's
 * `{activateOnUpdate}` option, which chained a lock+write+unlock+activate,
 * does not exist on `IAdtOperationOptions` in adt-clients 19 — activation is
 * its own separate call now). This changes the tool's surface beyond
 * `detail` — see the task report for why: `activate` is dropped (there is no
 * chained activation to opt into any more; call Activate separately).
 *
 * **The source goes in `options`, not `config`.** The shipped `update()`
 * reads `options?.sourceCode` — `config.sourceCode` belongs to `check` alone.
 * Verified against `AdtFunctionInclude.js`.
 */

import { functionIncludeDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateFunctionInclude',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Update. Subject: FunctionInclude. Will be useful for updating a function group include. Update source code of an existing ABAP function group include. Takes the lock handle from a prior LockFunctionInclude/LockFunctionModule-style lock — this tool does not lock or unlock the include itself.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description:
          'Function group name containing the include (e.g., ZOK_FG_MCP01).',
      },
      include_name: {
        type: 'string',
        description:
          'Include name (e.g., LZOK_FG_MCP01F01). Include must already exist.',
      },
      source_code: {
        type: 'string',
        description: 'Complete ABAP include source code.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from a prior lock call on this include. Required — the shipped write endpoint answers a refusal without one.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable includes.',
      },
      ...DETAIL_PROPERTY,
    },
    required: [
      'function_group_name',
      'include_name',
      'source_code',
      'lock_handle',
    ],
  },
} as const;

interface UpdateFunctionIncludeArgs {
  function_group_name: string;
  include_name: string;
  source_code: string;
  lock_handle: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateFunctionInclude(
  context: HandlerContext,
  args: UpdateFunctionIncludeArgs,
) {
  const { connection, logger } = context;

  if (!args.function_group_name || args.function_group_name.length > 30) {
    return return_error(
      new Error(
        'Function group name is required and must not exceed 30 characters',
      ),
    );
  }
  if (!args.include_name) {
    return return_error(new Error('include_name is required'));
  }
  if (!args.source_code) {
    return return_error(new Error('source_code is required'));
  }
  if (!args.lock_handle) {
    return return_error(new Error('lock_handle is required'));
  }

  const functionGroupName = args.function_group_name.toUpperCase();
  const includeName = args.include_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateFunctionInclude', detail },
    () =>
      createAdtClient(connection, logger)
        .getFunctionInclude(resultsFor(functionIncludeDocuments))
        .update(
          {
            functionGroupName,
            includeName,
            transportRequest: args.transport_request,
          },
          {
            sourceCode: args.source_code,
            lockHandle: args.lock_handle,
            analyse: analyseException,
          },
        ),
    project(detail, terseWrite),
  );
}
