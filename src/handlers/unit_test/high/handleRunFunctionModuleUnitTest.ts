/**
 * RunFunctionModuleUnitTest — run the ABAP Unit tests that exercise one
 * function module and answer the result.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { return_error } from '../../../lib/utils';
import { projectRun, runAndWait } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'RunFunctionModuleUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Run the ABAP Unit tests of a function module and return the result.',
  inputSchema: {
    type: 'object',
    properties: {
      function_module_name: {
        type: 'string',
        description: 'Function module whose tests run.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['function_module_name'],
  },
} as const;

interface RunFunctionModuleUnitTestArgs {
  function_module_name: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleRunFunctionModuleUnitTest(
  context: HandlerContext,
  args: RunFunctionModuleUnitTestArgs,
) {
  if (!args?.function_module_name) {
    return return_error(new Error('function_module_name is required'));
  }
  const detail = detailOf(args);
  return answer(
    { tool: 'RunFunctionModuleUnitTest', detail },
    () => runAndWait(context, 'functionModule', args.function_module_name),
    projectRun(detail),
  );
}
