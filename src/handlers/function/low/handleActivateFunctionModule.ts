import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * ActivateFunctionModuleLow Handler - Activate ABAP Function Module
 *
 * Uses AdtClient.getFunctionModule().activate from @mcp-abap-adt/adt-clients 19.
 */

import { functionModuleDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateFunctionModuleLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP function module. Returns activation status and any warnings/errors.',
  inputSchema: z.object({
    function_module_name: z.string().describe('Function module name.'),
    function_group_name: z.string().describe('Function group name.'),
    ...DETAIL_SHAPE,
  }),
} as const;

interface ActivateFunctionModuleArgs {
  function_module_name: string;
  function_group_name: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateFunctionModule(
  context: HandlerContext,
  args: ActivateFunctionModuleArgs,
) {
  const { connection, logger } = context;
  const { function_module_name, function_group_name } = args;

  if (!function_module_name) {
    return return_error(new Error('function_module_name is required'));
  }
  if (!function_group_name) {
    return return_error(new Error('function_group_name is required'));
  }

  const functionModuleName = function_module_name.toUpperCase();
  const functionGroupName = function_group_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateFunctionModuleLow', detail },
    () =>
      withAdtHeaders(context, 'functionModule.activate', (headers) =>
        createAdtClient(connection, logger)
          .getFunctionModule(resultsFor(functionModuleDocuments))
          .activate(
            { functionModuleName, functionGroupName },
            { headers, analyse: analyseActivation },
          ),
      ),
    project(detail, terseActivation),
  );
}
