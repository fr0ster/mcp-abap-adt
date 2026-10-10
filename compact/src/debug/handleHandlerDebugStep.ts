import { DETAIL_PROPERTY } from '@mcp-abap-adt/lib/compact-shared';
import {
  addressOf,
  type BreakpointTarget,
  type DebuggerInstance,
  debugAnswer,
  debugStateAnswer,
  LINE_TARGET_PROPERTIES,
  lineUriOf,
  STATE_HANDLE_PROPERTY,
} from '@mcp-abap-adt/lib/debugger';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { branchByKind, failedAnswer } from './shared';

export const TOOL_DEFINITION = {
  name: 'HandlerDebugStep',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Moves the stopped debuggee (into, over, return, continue, run or jump to a line), ends it where it stands, or ends the debug session.',
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      action: {
        type: 'string',
        enum: [
          'into',
          'over',
          'return',
          'continue',
          'run_to_line',
          'jump_to_line',
          'terminate',
          'stop',
        ],
        description:
          'into enters the call, over runs it, return leaves the current one, continue runs to the next stop; run_to_line executes up to the line, jump_to_line moves there without executing what lies between; terminate ends the debuggee where it stands; stop ends the debug session. An AMDP stop takes over, continue, terminate and stop.',
      },
      ...LINE_TARGET_PROPERTIES,
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle', 'action'],
  },
} as const;

const STEPS = {
  into: 'stepInto',
  over: 'stepOver',
  return: 'stepReturn',
  continue: 'stepContinue',
} as const;

export async function handleHandlerDebugStep(
  context: HandlerContext,
  args: any,
) {
  const action = String(args.action);
  // The state ends once nothing is held; both kinds are stopped by the instance.
  const stopped = (d: DebuggerInstance) =>
    debugAnswer(
      args,
      async () => {
        context.state!.endWhenEmpty();
        await d.stop();
        return { value: { state: 'stopped' }, raw: '' };
      },
      (v) => v,
    );
  const refused = (kind: string) =>
    debugAnswer(
      args,
      async () => {
        throw new Error(
          `action: ${action} does not apply to an ${kind} debug session`,
        );
      },
      (v) => v,
    );
  return branchByKind(
    context,
    args,
    {
      amdp: (d) => {
        if (action === 'over' || action === 'continue') {
          return debugAnswer(
            args,
            async () => d.amdp.step(action),
            (v) => ({ state: v }),
          );
        }
        if (action === 'terminate') {
          return debugAnswer(
            args,
            async () => {
              await d.amdp.cancel();
              return { value: 'cancelled', raw: '' };
            },
            (v) => v,
          );
        }
        if (action === 'stop') return stopped(d);
        return refused('amdp');
      },
      abap: (d) => {
        if (action in STEPS) {
          return debugStateAnswer(args, async () =>
            d.abap.step(STEPS[action as keyof typeof STEPS]),
          );
        }
        if (action === 'run_to_line' || action === 'jump_to_line') {
          return debugStateAnswer(args, async () => {
            let target: BreakpointTarget = args;
            if (!args.object_type || !args.object_name) {
              // No object given: the line is in the object the debuggee stands in.
              const top = (await d.abap.getStack()).value.stack.frames[0];
              const here = top ? addressOf(top.uri) : undefined;
              if (!here)
                throw new Error(
                  'object_type and object_name: needed, the stopped frame has no object address',
                );
              target = here;
            }
            return d.abap.stepToLine(
              action === 'jump_to_line' ? 'stepJumpToLine' : 'stepRunToLine',
              lineUriOf(target, Number(args.line)),
            );
          });
        }
        if (action === 'terminate') {
          return debugStateAnswer(args, async () => d.abap.terminate());
        }
        if (action === 'stop') return stopped(d);
        return refused('abap');
      },
    },
    failedAnswer(args),
  );
}
