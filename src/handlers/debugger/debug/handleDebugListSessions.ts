// src/handlers/debugger/debug/handleDebugListSessions.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugListSessions',
  available_in: ['onprem', 'cloud'] as const,
  description: '[debug] Debug sessions this server holds for the caller.',
  inputSchema: {
    type: 'object',
    properties: { ...DETAIL_PROPERTY },
  },
} as const;

export async function handleDebugListSessions(
  context: HandlerContext,
  args: any,
) {
  return debugAnswer(
    args,
    async () => {
      if (!context.state)
        throw new Error('debugging is not served by this server');
      const l =
        context.state.host?.peers() ??
        (context.state.holdsState() ? [context.state.describe()] : []);
      return { value: l, raw: JSON.stringify(l) };
    },
    (v) => v,
  );
}
