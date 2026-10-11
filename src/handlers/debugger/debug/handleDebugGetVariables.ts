// src/handlers/debugger/debug/handleDebugGetVariables.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { terseVariables } from '../../../lib/debugger/readings';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
import type { ArgsOf } from '../../../lib/handlers/argsOf';
import { DETAIL_PROPERTY } from '../../../lib/strategies/detail';
import type { HandlerContext } from '../../interfaces';

export const TOOL_DEFINITION = {
  name: 'DebugGetVariables',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[debug] Variables of the stopped debuggee, by name or as members of a parent. Needs a stopped debuggee.',
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      names: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Variables by name; a path reads a component or a table row.',
      },
      parents: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Instead of names: members of these scopes, objects or tables.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle'],
  },
} as const;

export async function handleDebugGetVariables(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  const parents = args.parents?.length ? args.parents : ['@ROOT'];
  const names = args.names?.length ? args.names : undefined;
  const byName = names !== undefined;
  return debugAnswer(
    args,
    async () => {
      const a = requireDebugger(context, args, 'use').abap;
      return names ? a.getVariables(names) : a.getChildVariables(parents);
    },
    (v) => {
      if (byName) return terseVariables(v);
      // Every member keeps the id a further read takes as a parent; with several parents asked, the link to its parent too.
      const variables = new Map(terseVariables(v).map((t) => [t.id, t]));
      return v.children.map((c) => ({
        ...(variables.get(c.child) ?? { id: c.child, label: c.label }),
        ...(parents.length > 1 ? { parent: c.parent } : {}),
      }));
    },
  );
}
