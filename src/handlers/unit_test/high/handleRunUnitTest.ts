/**
 * RunUnitTest — run every ABAP Unit test of a class and answer the result.
 * Waits for the run within a bound; a run that outlasts it answers its run_id.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { TIMEOUT_PROPERTY, withLongToolAdvice } from '../../../lib/longTools';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { return_error } from '../../../lib/utils';
import { projectRun, runAndWait } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'RunUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    'Run the ABAP Unit tests of a class and return the result.',
  ),
  inputSchema: {
    type: 'object',
    properties: {
      timeout: TIMEOUT_PROPERTY,
      class_name: {
        type: 'string',
        description: 'Class whose tests run.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name'],
  },
} as const;

interface RunUnitTestArgs {
  class_name: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleRunUnitTest(
  context: HandlerContext,
  args: RunUnitTestArgs,
) {
  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  const detail = detailOf(args);
  return answer(
    { tool: 'RunUnitTest', detail },
    () => runAndWait(context, 'class', args.class_name),
    projectRun(detail),
  );
}
