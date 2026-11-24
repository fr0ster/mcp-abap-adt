import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugStop.ts
import {
  debugState,
  endDebugBatchAnswers,
  requireDebugger,
} from '../../../lib/debugger/access';
import { debugAnswer, stoppedSession } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { purpose, toolDescription } from '../../../lib/description';
import { STOPPED } from '../../../lib/description/debugger';
import { runParts } from '../../../lib/description/runs';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugStop',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'debug',
      purpose: purpose(
        'Ends a debug session, ABAP and AMDP: releases a stopped debuggee, removes the breakpoints, stops listening and closes its connections.',
      ),
      result: STOPPED,
    }),
  ),
  inputSchema: z.object({ ...STATE_HANDLE_PROPERTY, ...DETAIL_SHAPE }),
} as const;

export async function handleDebugStop(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () => {
      const d = requireDebugger(context, args, 'use');
      debugState(context).endWhenEmpty();
      // A note is no debt: SAP's final refusal, reaching the model as it is.
      const notes = await d.stop();
      // Complete: a debugger batch's kept answers end with the state.
      endDebugBatchAnswers(context);
      return { value: stoppedSession(notes), raw: JSON.stringify(notes) };
    },
    (v) => v,
  );
}
