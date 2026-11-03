import * as z from 'zod';
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
  LINE_WORDS,
  STATE_HANDLE_PROPERTY,
} from '../../../lib/debugger/schemas';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugStepToLine',
  available_in: ['onprem', 'cloud'] as const,
  description: '[debug] Runs or jumps the stopped debuggee to a line.',
  inputSchema: z.object({
    ...STATE_HANDLE_PROPERTY,
    mode: z
      .enum(['run', 'jump'])
      .describe(
        'run executes up to the line; jump moves there without executing what lies between.',
      ),
    object_type: z.string().describe(LINE_WORDS.object_type),
    object_name: z.string().describe(LINE_WORDS.object_name),
    line: z.number().int().describe(LINE_WORDS.line),
    include: LINE_TARGET_PROPERTIES.include,
    parent_name: LINE_TARGET_PROPERTIES.parent_name,
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleDebugStepToLine(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
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
