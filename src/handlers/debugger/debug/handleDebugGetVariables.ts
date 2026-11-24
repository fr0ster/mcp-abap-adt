import * as z from 'zod';
// src/handlers/debugger/debug/handleDebugGetVariables.ts
import {
  debugBatchRecorder,
  requireDebugger,
} from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import {
  terseChildVariables,
  terseVariables,
} from '../../../lib/debugger/readings';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugGetVariables',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      tag: 'read-only',
      purpose: purpose(
        'Reads variables of the stopped ABAP debuggee by name, or the members of parent variables.',
      ),
    }),
  ),
  inputSchema: z.object({
    ...STATE_HANDLE_PROPERTY,
    names: z
      .array(z.string())
      .optional()
      .describe('Variables by name; a path reads a component or a table row.'),
    parents: z
      .array(z.string())
      .optional()
      .describe(
        'Instead of names: members of these scopes, objects or tables.',
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

export async function handleDebugGetVariables(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const parents = args.parents?.length ? args.parents : ['@ROOT'];
  const names = args.names?.length ? args.names : undefined;
  const byName = names !== undefined;
  return debugAnswer(
    args,
    async () => {
      const a = requireDebugger(context, args, 'use').abap;
      const recorder = debugBatchRecorder(context);
      if (recorder !== undefined)
        return names
          ? a.recordVariables(recorder, names)
          : a.recordChildVariables(recorder, parents);
      return names ? a.getVariables(names) : a.getChildVariables(parents);
    },
    (v) =>
      byName ? terseVariables(v) : terseChildVariables(v, parents.length > 1),
  );
}
