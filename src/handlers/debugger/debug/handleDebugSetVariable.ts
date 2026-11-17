import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugSetVariable.ts
import {
  debugBatchRecorder,
  requireDebugger,
} from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { terseVariables } from '../../../lib/debugger/readings';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugSetVariable',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Sets a variable of the stopped debuggee. Needs a stopped debuggee.',
  inputSchema: z.object({
    ...STATE_HANDLE_PROPERTY,
    name: z.string().describe('Variable to set; a path reaches a component.'),
    value: z
      .string()
      .describe('New value; converted to the type by the system.'),
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleDebugSetVariable(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  return debugAnswer(
    args,
    async () => {
      const abap = requireDebugger(context, args, 'use').abap;
      const recorder = debugBatchRecorder(context);
      return recorder !== undefined
        ? abap.recordSetVariable(recorder, args.name, args.value)
        : abap.setVariable(args.name, args.value);
    },
    terseVariables,
  );
}
