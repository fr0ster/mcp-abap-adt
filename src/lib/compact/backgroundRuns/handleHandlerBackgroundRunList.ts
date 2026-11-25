import * as z from 'zod';
import { TOOL_DEFINITION as ListBackgroundRuns } from '../../../handlers/background_run/readonly/handleListBackgroundRuns';
import { answerBackgroundList } from '../../backgroundRuns/answers';
import { compactOf } from '../../description/index';
import type { HandlerContext } from '../../handlers/index';

export const TOOL_DEFINITION = {
  name: 'HandlerBackgroundRunList',
  description: compactOf(ListBackgroundRuns.description),
  inputSchema: z.object({}),
} as const;

export async function handleHandlerBackgroundRunList(
  context: HandlerContext,
  _args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return answerBackgroundList(context);
}
