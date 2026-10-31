/**
 * RunCdsUnitTest — run the ABAP Unit tests of a CDS view (the tests in its
 * test class) and answer the result.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { return_error } from '../../../lib/utils';
import { MAX_STATUS_POLLS_PROPERTY, maxStatusPollsOf } from '../shared/pollRun';
import { projectRun, runAndWait } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'RunCdsUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Runs the ABAP Unit tests of the CDS view test class named by class_name and returns the result: the run is started, its status is read by up to max_status_polls long polls (default 5; ADT holds each open while the run is in progress), and the result is returned once the run finished, else its run_id, whose status and result are read by run_id.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Test class of the CDS view.',
      },
      max_status_polls: MAX_STATUS_POLLS_PROPERTY.max_status_polls,
      ...DETAIL_PROPERTY,
    },
    required: ['class_name'],
  },
} as const;

interface RunCdsUnitTestArgs {
  class_name: string;
  max_status_polls?: number;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleRunCdsUnitTest(
  context: HandlerContext,
  args: RunCdsUnitTestArgs,
) {
  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  const maxStatusPolls = maxStatusPollsOf(args);
  if (maxStatusPolls instanceof Error) return return_error(maxStatusPolls);
  const detail = detailOf(args);
  return answer(
    { tool: 'RunCdsUnitTest', detail },
    () => runAndWait(context, 'class', args.class_name, maxStatusPolls),
    projectRun(detail, maxStatusPolls),
  );
}
