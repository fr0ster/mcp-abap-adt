import * as z from 'zod';
import { answerBackgroundList } from '../../../lib/backgroundRuns/answers';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'ListBackgroundRuns',
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose(
        "Lists the caller's background runs, running, finished and cancelled.",
      ),
    }),
  ),
  inputSchema: z.object({}),
} as const;

export async function handleListBackgroundRuns(
  context: HandlerContext,
  _args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerBackgroundList(context);
}
