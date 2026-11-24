import * as z from 'zod';
import { wireAnswer } from '../../../lib/detail';
import {
  ASSEMBLED_DETAIL_SHAPE,
  levelOf,
} from '../../../lib/strategies/detail';
import { RUNNER_FIELD, SCOPE_FIELD, WAIT_FIELD } from '../shared/runner';
/**
 * RunFunctionGroupUnitTest — run every ABAP Unit test of a function group and
 * answer the result.
 */

import { answer } from '../../../lib/answer';
import { toolDescription } from '../../../lib/description';
import { unitTestRun } from '../../../lib/description/runs';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { return_error } from '../../../lib/utils';
import {
  runnerOf,
  runnerWaitOf,
  scopeOf,
  type UnitTestScopeArgs,
} from '../shared/runner';
import { projectSync, runTestsSync } from '../shared/runSync';
import { projectRun, runAndWait } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'RunFunctionGroupUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    unitTestRun('every ABAP Unit test of a function group', 'sync'),
  ),
  inputSchema: z.object({
    function_group_name: z.string().describe('Function group whose tests run.'),
    runner: RUNNER_FIELD,
    wait: WAIT_FIELD,
    scope: SCOPE_FIELD,
    ...ASSEMBLED_DETAIL_SHAPE,
  }),
} as const;

type RunFunctionGroupUnitTestArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

/**
 * The tool's answer; at `raw` what ADT sent: the documents the call's
 * reads answered, read with the tool at full (`wireAnswer`).
 */
export async function handleRunFunctionGroupUnitTest(
  context: HandlerContext,
  args: RunFunctionGroupUnitTestArgs,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'RunFunctionGroupUnitTest',
        shape: 'assembled',
      },
      () =>
        answeredRunFunctionGroupUnitTest(context, { ...args, detail: 'full' }),
    );
  }
  return answeredRunFunctionGroupUnitTest(context, args);
}

async function answeredRunFunctionGroupUnitTest(
  context: HandlerContext,
  args: RunFunctionGroupUnitTestArgs,
) {
  if (!args?.function_group_name) {
    return return_error(new Error('function_group_name is required'));
  }
  const runner = runnerOf(args);
  const wait = runnerWaitOf(args, runner);
  if (wait instanceof Error) return return_error(wait);
  const detail = detailOf(args);
  const runOptions = { scope: scopeOf(args.scope) };
  if (runner === 'sync') {
    return answer(
      { tool: 'RunFunctionGroupUnitTest', detail },
      () =>
        runTestsSync(
          context,
          {
            carrier: 'functionGroup',
            functionGroupName: args.function_group_name,
          },
          runOptions,
        ),
      projectSync(detail),
    );
  }
  return answer(
    { tool: 'RunFunctionGroupUnitTest', detail },
    () =>
      runAndWait(
        context,
        'functionGroup',
        args.function_group_name,
        wait,
        runOptions,
      ),
    projectRun(detail),
  );
}
