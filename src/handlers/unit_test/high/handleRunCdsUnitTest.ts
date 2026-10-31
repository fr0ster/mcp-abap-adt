/**
 * RunCdsUnitTest — run the ABAP Unit tests of a CDS view (the tests in its
 * test class) and answer the result.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { return_error } from '../../../lib/utils';
import { WAIT_PROPERTY, waitOf } from '../shared/runner';
import { projectRun, runAndWait } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'RunCdsUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Runs the ABAP Unit tests of the CDS view test class named by class_name. The run is started; with wait true (default) its status is read once by long polling, SAP holding the read until the run finishes: a run SAP answers finished returns its result, the call lasting as long as the run, and a run SAP answers with another status returns the run_id and that status, read on by run_id; with wait false the call answers the run_id right after the start, and the status and result are read by run_id. A long run under a client with a request time limit is started with wait false.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Test class of the CDS view.',
      },
      wait: WAIT_PROPERTY.wait,
      ...DETAIL_PROPERTY,
    },
    required: ['class_name'],
  },
} as const;

interface RunCdsUnitTestArgs {
  class_name: string;
  wait?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleRunCdsUnitTest(
  context: HandlerContext,
  args: RunCdsUnitTestArgs,
) {
  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  const wait = waitOf(args);
  if (wait instanceof Error) return return_error(wait);
  const detail = detailOf(args);
  return answer(
    { tool: 'RunCdsUnitTest', detail },
    () => runAndWait(context, 'class', args.class_name, wait),
    projectRun(detail),
  );
}
