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
import { toolDescription } from '../../../lib/description';
import { unitTestRun } from '../../../lib/description/runs';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { return_error } from '../../../lib/utils';
import { waitOf } from '../shared/runner';
import { projectRun, runAndWait } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'RunCdsUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    unitTestRun('the ABAP Unit tests of a CDS view test class'),
  ),
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
