import * as z from 'zod';
import {
  debugState,
  endDebugBatchAnswers,
  requireDebugger,
} from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { purpose, toolDescription } from '../../../lib/description';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'AmdpDebugStop',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'debug',
    purpose: purpose(
      'Ends the AMDP part of a debug session, releasing a suspended debuggee first.',
    ),
    returns: [],
  }),
  inputSchema: z.object({ ...STATE_HANDLE_PROPERTY, ...DETAIL_SHAPE }),
} as const;

export async function handleAmdpDebugStop(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () => {
      const d = requireDebugger(context, args, 'use');
      debugState(context).endWhenEmpty();
      await d.amdp.stop();
      // The whole debug state ended: a debugger batch's kept answers with it.
      endDebugBatchAnswers(context);
      return { value: { state: 'stopped' }, raw: '' };
    },
    (v) => v,
  );
}
