import * as z from 'zod';
import { requireDebugger } from '../../../lib/debugger/access';
import { terseAmdpEvent } from '../../../lib/debugger/amdpReadings';
import { debugAnswer } from '../../../lib/debugger/answer';
import {
  HOLD_SECONDS_PROPERTY,
  STATE_HANDLE_PROPERTY,
} from '../../../lib/debugger/schemas';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'AmdpDebugWait',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] [debug] AMDP events of a debug session after waiting up to hold_seconds.',
  inputSchema: z.object({
    ...STATE_HANDLE_PROPERTY,
    ...HOLD_SECONDS_PROPERTY,
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleAmdpDebugWait(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () => {
      const d = requireDebugger(context, args, 'use');
      const s = await d.amdp.wait(args.hold_seconds ?? 10);
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
