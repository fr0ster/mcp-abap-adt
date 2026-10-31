// src/handlers/debugger/debug/handleDebugStep.ts
import {
  debugBatchRecorder,
  requireDebugger,
} from '../../../lib/debugger/access';
import {
  debugAnswer,
  debugStateAnswer,
  terseOnceStep,
} from '../../../lib/debugger/answer';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugStep',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Moves the stopped debuggee into a call, over it, out of the current one or on to the next stop; or leaves it running, the listener and the breakpoints kept, by detaching or by freeing the debugger.',
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
          'detach',
          'release_debugger',
        ],
        description:
          'into enters the call, over runs it, return leaves the current one, continue runs to the next stop; detach lets the program run on, the listener and the breakpoints kept; release_debugger frees the debugger and the program runs on. detach and release_debugger apply to ABAP only.',
      },
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

export async function handleDebugStep(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  const recorder = debugBatchRecorder(context);
  if (
    recorder !== undefined &&
    args.action !== 'detach' &&
    args.action !== 'release_debugger'
  ) {
    // Recorded in the debugger batch: the step's own request alone.
    const step = STEPS[args.action];
    return debugAnswer(
      args,
      async () =>
        requireDebugger(context, args, 'use').abap.recordStep(recorder, step),
      terseOnceStep,
    );
  }
  return debugStateAnswer(args, async () => {
    const d = requireDebugger(context, args, 'use');
    if (args.action === 'detach' || args.action === 'release_debugger') {
      // Refused before the wire: an AMDP debuggee has neither.
      if (d.amdp.holdsState() && !d.abap.holdsState())
        throw new Error(
          `action: ${args.action} does not apply to an AMDP debug session`,
        );
      return args.action === 'detach'
        ? d.abap.detach()
        : d.abap.releaseDebugger();
    }
    return d.abap.step(STEPS[args.action]);
  });
}
