import * as z from 'zod';
import {
  debugBatchRecorder,
  requireDebugger,
} from '../../../lib/debugger/access';
import { amdpStepped, debugAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'AmdpDebugStep',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'debug',
      purpose: purpose(
        'Steps the stopped AMDP debuggee over a statement or on to the next stop.',
      ),
    }),
  ),
  inputSchema: z.object({
    ...STATE_HANDLE_PROPERTY,
    action: z
      .enum(['over', 'continue'])
      .describe(
        'over runs the current statement, continue runs to the next stop.',
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleAmdpDebugStep(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  // Recorded in the debugger batch: the step's own request.
  const recorder = debugBatchRecorder(context);
  return debugAnswer(
    args,
    async () => {
      const amdp = requireDebugger(context, args, 'use').amdp;
      return recorder !== undefined
        ? amdp.recordStep(recorder, args.action)
        : amdp.step(args.action);
    },
    amdpStepped,
  );
}
