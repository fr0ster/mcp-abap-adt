// src/handlers/debugger/debug/handleDebugStepToLine.ts
import {
  debugBatchRecorder,
  requireDebugger,
} from '../../../lib/debugger/access';
import {
  debugAnswer,
  debugStateAnswer,
  terseOnceStep,
} from '../../../lib/debugger/answer';
import { lineUriOf } from '../../../lib/debugger/objectUri';
import {
  LINE_TARGET_PROPERTIES,
  STATE_HANDLE_PROPERTY,
} from '../../../lib/debugger/schemas';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugStepToLine',
  available_in: ['onprem', 'cloud'] as const,
  description: '[debug] Runs or jumps the stopped debuggee to a line.',
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      mode: {
        type: 'string',
        enum: ['run', 'jump'],
        description:
          'run executes up to the line; jump moves there without executing what lies between.',
      },
      ...LINE_TARGET_PROPERTIES,
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle', 'mode', 'object_type', 'object_name', 'line'],
  },
} as const;

export async function handleDebugStepToLine(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  const method = args.mode === 'jump' ? 'stepJumpToLine' : 'stepRunToLine';
  const recorder = debugBatchRecorder(context);
  if (recorder !== undefined) {
    // Recorded in the debugger batch: the move's own request alone.
    return debugAnswer(
      args,
      async () =>
        requireDebugger(context, args, 'use').abap.recordStepToLine(
          recorder,
          method,
          lineUriOf(args, args.line),
        ),
      terseOnceStep,
    );
  }
  return debugStateAnswer(args, async () =>
    requireDebugger(context, args, 'use').abap.stepToLine(
      method,
      lineUriOf(args, args.line),
    ),
  );
}
