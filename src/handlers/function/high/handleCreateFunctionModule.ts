/**
 * CreateFunctionModule Handler - ABAP Function Module Creation via ADT API
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
 * inside its group's package, and there is no `packageName` field to send.
 * Kept on the tool schema, for compatibility (removing an existing parameter
 * is not this migration's job), but never forwarded — matching
 * `CreateFunctionModuleLow`. Source is `UpdateFunctionModule`'s job.
 */

import { functionModuleDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateFunctionModule',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: FunctionModule. Will be useful for creating function module. Create a new ABAP function module within an existing function group. Creates the function module in initial state.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Parent function group name (e.g., ZTEST_FG_001)',
      },
      function_module_name: {
        type: 'string',
        description:
          'Function module name (e.g., Z_TEST_FUNCTION_001). Must follow SAP naming conventions (start with Z or Y, max 30 chars).',
      },
      description: {
        type: 'string',
        description: 'Optional description for the function module',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['function_group_name', 'function_module_name'],
  },
} as const;

interface CreateFunctionModuleArgs {
  function_group_name: string;
  function_module_name: string;
  description?: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateFunctionModule(
  context: HandlerContext,
  args: CreateFunctionModuleArgs,
) {
  const { connection, logger } = context;

  if (!args?.function_group_name) {
    return return_error(new Error('function_group_name is required'));
  }
  if (!args?.function_module_name) {
    return return_error(new Error('function_module_name is required'));
  }

  const functionGroupName = args.function_group_name.toUpperCase();
  const functionModuleName = args.function_module_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateFunctionModule', detail },
    () =>
      createAdtClient(connection, logger)
        .getFunctionModule(resultsFor(functionModuleDocuments))
        .create(
          {
            functionGroupName,
            functionModuleName,
            description: args.description || functionModuleName,
            transportRequest: args.transport_request,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
