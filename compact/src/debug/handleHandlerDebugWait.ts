import { DETAIL_PROPERTY } from '@mcp-abap-adt/lib/compact-shared';
import {
  debugAnswer,
  debugStateAnswer,
  HOLD_SECONDS_PROPERTY,
  STATE_HANDLE_PROPERTY,
  terseAmdpEvent,
} from '@mcp-abap-adt/lib/debugger';
import type { ArgsOf, HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { branchByKind, failedAnswer } from './shared';

export const TOOL_DEFINITION = {
  name: 'HandlerDebugWait',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'State of a debug session after waiting up to hold_seconds; for AMDP, its events.',
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

export async function handleHandlerDebugWait(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  const seconds = () => args.hold_seconds ?? 10;
  return branchByKind(
    context,
    args,
    {
      amdp: (d) =>
        debugAnswer(
          args,
          async () => {
            const s = await d.amdp.wait(seconds());
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
        ),
      abap: (d) => debugStateAnswer(args, async () => d.abap.wait(seconds())),
    },
    failedAnswer(args),
  );
}
