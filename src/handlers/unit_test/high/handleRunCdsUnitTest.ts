import * as z from 'zod';
import { wireAnswer } from '../../../lib/detail';
import {
  ASSEMBLED_DETAIL_SHAPE,
  levelOf,
} from '../../../lib/strategies/detail';
import { WAIT_FIELD } from '../shared/runner';
/**
 * RunCdsUnitTest — run the ABAP Unit tests of a CDS view (the tests in its
 * test class) and answer the result.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { return_error } from '../../../lib/utils';
import { waitOf } from '../shared/runner';
import { projectRun, runAndWait } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'RunCdsUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Runs the ABAP Unit tests of the CDS view test class named by class_name. The run is started; with wait true (default) its status is read at once, and a run SAP answers running is read again by long polling, SAP holding each read until the run finishes: a run SAP answers finished returns its result, the call lasting as long as the run, a run SAP reports unstarted is read again by long polling, and a run that long-polled read reports unstarted returns the run_id and that status, and any other status is an error stating what SAP answered; with wait false the call answers the run_id right after the start, and the status and result are read by run_id. A long run under a client with a request time limit is started with wait false.',
  inputSchema: z.object({
    class_name: z.string().describe('Test class of the CDS view.'),
    wait: WAIT_FIELD,
    ...ASSEMBLED_DETAIL_SHAPE,
  }),
} as const;

type RunCdsUnitTestArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * The tool's answer; at `raw` what ADT sent: the documents the call's
 * reads answered, read with the tool at full (`wireAnswer`).
 */
export async function handleRunCdsUnitTest(
  context: HandlerContext,
  args: RunCdsUnitTestArgs,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'RunCdsUnitTest',
        shape: 'assembled',
      },
      () => answeredRunCdsUnitTest(context, { ...args, detail: 'full' }),
    );
  }
  return answeredRunCdsUnitTest(context, args);
}

async function answeredRunCdsUnitTest(
  context: HandlerContext,
  args: RunCdsUnitTestArgs,
) {
  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  const wait = waitOf(args);
  const detail = detailOf(args);
  return answer(
    { tool: 'RunCdsUnitTest', detail },
    () => runAndWait(context, 'class', args.class_name, wait),
    projectRun(detail),
  );
}
