/**
 * RunFunctionGroupUnitTest — run every ABAP Unit test of a function group and
 * answer the result.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { return_error } from '../../../lib/utils';
import { projectRun, runAndWait } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'RunFunctionGroupUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Run all ABAP Unit tests of a function group and return the result.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Function group whose tests run.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['function_group_name'],
  },
} as const;

interface RunFunctionGroupUnitTestArgs {
  function_group_name: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleRunFunctionGroupUnitTest(
  context: HandlerContext,
  args: RunFunctionGroupUnitTestArgs,
) {
  if (!args?.function_group_name) {
    return return_error(new Error('function_group_name is required'));
  }
  const detail = detailOf(args);
  return answer(
    { tool: 'RunFunctionGroupUnitTest', detail },
    () => runAndWait(context, 'functionGroup', args.function_group_name),
    projectRun(detail),
  );
}
