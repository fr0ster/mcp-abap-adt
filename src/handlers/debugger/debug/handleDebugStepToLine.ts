// src/handlers/debugger/debug/handleDebugStepToLine.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugStateAnswer } from '../../../lib/debugger/answer';
import { lineUriOf } from '../../../lib/debugger/objectUri';
import {
  LINE_TARGET_PROPERTIES,
  STATE_HANDLE_PROPERTY,
} from '../../../lib/debugger/schemas';
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
  args: any,
) {
  return debugStateAnswer(args, async () =>
    requireDebugger(context, args, 'use').abap.stepToLine(
      args.mode === 'jump' ? 'stepJumpToLine' : 'stepRunToLine',
      lineUriOf(args as any, Number(args.line)),
    ),
  );
}
