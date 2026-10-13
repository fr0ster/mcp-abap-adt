/**
 * RunCdsUnitTest — run the ABAP Unit tests of a CDS view (the tests in its
 * test class) and answer the result.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { return_error } from '../../../lib/utils';
import { projectRun, runAndWait } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'RunCdsUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description: 'Run the ABAP Unit tests of a CDS view and return the result.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Test class of the CDS view.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name'],
  },
} as const;

interface RunCdsUnitTestArgs {
  class_name: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleRunCdsUnitTest(
  context: HandlerContext,
  args: RunCdsUnitTestArgs,
) {
  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  const detail = detailOf(args);
  return answer(
    { tool: 'RunCdsUnitTest', detail },
    () => runAndWait(context, 'class', args.class_name),
    projectRun(detail),
  );
}
