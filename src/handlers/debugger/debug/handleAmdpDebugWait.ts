import { requireDebugger } from '../../../lib/debugger/access';
import { terseAmdpEvent } from '../../../lib/debugger/amdpReadings';
import { debugAnswer } from '../../../lib/debugger/answer';
import {
  HOLD_SECONDS_PROPERTY,
  STATE_HANDLE_PROPERTY,
} from '../../../lib/debugger/schemas';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'AmdpDebugWait',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] AMDP events of a debug session after waiting up to hold_seconds.',
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      ...HOLD_SECONDS_PROPERTY,
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle'],
  },
} as const;

export async function handleAmdpDebugWait(context: HandlerContext, args: any) {
  return debugAnswer(
    args,
    async () => {
      const d = requireDebugger(context, args, 'use');
      const seconds =
        args.hold_seconds === undefined ? 10 : Number(args.hold_seconds);
      // A value that is no number would wait 0 ms and look like an answer: refuse it.
      if (!Number.isFinite(seconds))
        throw new Error('hold_seconds: a number of seconds');
      const s = await d.amdp.wait(seconds);
      return {
        value: s,
        raw:
          s.state === 'event'
            ? s.events.map((e) => e.body).join('\n')
            : JSON.stringify(s),
      };
    },
    (s) =>
      s.state === 'event'
        ? { state: 'event', events: s.events.map(terseAmdpEvent) }
        : s,
  );
}
