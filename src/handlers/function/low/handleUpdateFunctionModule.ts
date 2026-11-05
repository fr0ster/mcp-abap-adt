import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
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
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { inCheckedGroup } from '../../../lib/strategies/functionModuleGroup';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateFunctionModuleLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Update source code of an existing ABAP function module. Requires lock handle from LockObject and function group name. - use UpdateFunctionModule (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: z.object({
    function_module_name: z
      .string()
      .describe('Function module name. Function module must already exist.'),
    function_group_name: z
      .string()
      .describe('Function group name containing the function module.'),
    source_code: z
      .string()
      .describe('Complete ABAP function module source code.'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number, not a task. Required for transportable objects locked in a request.',
      ),
    lock_handle: z
      .string()
      .describe(
        'Lock handle from LockFunctionModule. Required for update operation.',
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

interface UpdateFunctionModuleArgs {
  function_module_name: string;
  function_group_name: string;
  source_code: string;
  transport_request?: string;
  lock_handle: string;
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

  const functionModuleName = function_module_name.toUpperCase();
  const functionGroupName = function_group_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateFunctionModuleLow', detail },
    () =>
      inCheckedGroup(context, functionGroupName, functionModuleName, () =>
        withAdtHeaders(context, 'functionModule.update', (headers) =>
          createAdtClient(connection, logger)
            .getFunctionModule(resultsFor(functionModuleDocuments))
            .update(
              {
                functionModuleName,
                functionGroupName,
                transportRequest: transport_request,
              },
              {
                headers,
                source: source_code,
                lockHandle: lock_handle,
                analyse: analyseException,
              },
            ),
        ),
      ),
    project(detail, terseWrite),
  );
}
