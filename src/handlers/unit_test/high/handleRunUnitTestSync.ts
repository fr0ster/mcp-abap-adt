/**
 * RunUnitTestSync — run every ABAP Unit test of a class with the synchronous
 * runner and answer the finished result: one request, no run id
 * (`../shared/runSync.ts`).
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import type { AdtReading } from '../../../lib/strategies/reading';
import { return_error } from '../../../lib/utils';
import { runClassTestsSync } from '../shared/runSync';

export const TOOL_DEFINITION = {
  name: 'RunUnitTestSync',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Runs the ABAP Unit tests of the ABAP class named by class_name in one synchronous request and returns the finished result, each test method with its alerts, in the same call.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class whose tests run.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name'],
  },
} as const;

interface RunUnitTestSyncArgs {
  class_name: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleRunUnitTestSync(
  context: HandlerContext,
  args: RunUnitTestSyncArgs,
) {
  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  const detail = detailOf(args);
  return answer(
    { tool: 'RunUnitTestSync', detail },
    () => runClassTestsSync(context, args.class_name.toUpperCase()),
    (result: AdtReading<unknown>) => ({
      success: true,
      finished: true,
      run_result: detail === 'raw' ? result.raw : result.value,
    }),
  );
}
