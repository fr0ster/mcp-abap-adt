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
import type { ArgsOf, HandlerContext } from '@mcp-abap-adt/lib/handlers';
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
          'into enters the call, over runs it, return leaves the current one, continue runs to the next stop; run_to_line executes up to the line, jump_to_line moves there without executing what lies between; terminate ends the debuggee where it stands; stop ends the debug session. For AMDP only over, continue, terminate and stop apply.',
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

const isStep = (action: string): action is keyof typeof STEPS =>
  action in STEPS;

export async function handleHandlerDebugStep(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  const action = args.action;
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
        if (isStep(action)) {
          return debugStateAnswer(args, async () => d.abap.step(STEPS[action]));
        }
        if (action === 'run_to_line' || action === 'jump_to_line') {
          return debugStateAnswer(args, async () => {
            // The schema cannot tie line to these two actions.
            const line = args.line;
            if (line === undefined)
              throw new Error(`line: needed for ${action}`);
            let target: BreakpointTarget;
            if (args.object_type && args.object_name) {
              target = {
                object_type: args.object_type,
                object_name: args.object_name,
                include: args.include,
                parent_name: args.parent_name,
              };
            } else {
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
              lineUriOf(target, line),
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
