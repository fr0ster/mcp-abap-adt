// src/handlers/debugger/debug/handleDebugGetVariables.ts
import { requireDebugger } from '../../../lib/debugger/access';
import { debugAnswer } from '../../../lib/debugger/answer';
import { terseVariables } from '../../../lib/debugger/readings';
import { STATE_HANDLE_PROPERTY } from '../../../lib/debugger/schemas';
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
  args: any,
) {
  const parents =
    Array.isArray(args.parents) && args.parents.length
      ? args.parents.map(String)
      : ['@ROOT'];
  const byName = Array.isArray(args.names) && args.names.length;
  return debugAnswer(
    args,
    async () => {
      const a = requireDebugger(context, args, 'use').abap;
      return byName
        ? a.getVariables(args.names.map(String))
        : a.getChildVariables(parents);
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
