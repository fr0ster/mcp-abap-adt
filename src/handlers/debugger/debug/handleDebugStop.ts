// src/handlers/debugger/debug/handleDebugStop.ts
import {
  endDebugBatchAnswers,
  requireDebugger,
} from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugStop',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] [debug] Ends a debug session, ABAP and AMDP: releases a stopped debuggee, removes the breakpoints, stops listening, closes the connections and lets the kept answers of its debugger batch go; a part that failed to undo is reported and kept with the answers.',
  inputSchema: {
    type: 'object',
    properties: { ...STATE_HANDLE_PROPERTY, ...DETAIL_PROPERTY },
    required: ['state_handle'],
  },
} as const;

export async function handleDebugStop(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () => {
      const d = requireDebugger(context, args, 'use');
      context.state!.endWhenEmpty();
      // A note is no debt: SAP's final refusal, reaching the model as it is.
      const notes = await d.stop();
      // Complete: a debugger batch's kept answers end with the state.
      endDebugBatchAnswers(context);
      return {
        value: { state: 'stopped', ...(notes.length ? { notes } : {}) },
        raw: JSON.stringify(notes, null, 2),
      };
    },
    (v) => v,
  );
}
