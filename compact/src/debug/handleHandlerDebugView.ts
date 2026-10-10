import { DETAIL_PROPERTY } from '@mcp-abap-adt/lib/compact-shared';
import {
  debugAnswer,
  readXmlDocument,
  STATE_HANDLE_PROPERTY,
  terseStop,
  terseVariables,
} from '@mcp-abap-adt/lib/debugger';
import type { ArgsOf, HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { branchByKind, failedAnswer } from './shared';

export const TOOL_DEFINITION = {
  name: 'HandlerDebugView',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "The stopped debuggee: stack, variables (by name, or the scopes), memory, or an AMDP table variable's rows.",
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      what: {
        type: 'string',
        enum: ['stack', 'variables', 'memory', 'table'],
        description:
          'stack, variables and memory read an ABAP stop; table reads an AMDP stop.',
      },
      names: {
        type: 'array',
        items: { type: 'string' },
        description:
          'variables: names to read, a path reads a component or a table row; the scopes when omitted. table: the table variable, first entry.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle', 'what'],
  },
} as const;

export async function handleHandlerDebugView(
  context: HandlerContext,
  args: ArgsOf<typeof TOOL_DEFINITION.inputSchema>,
) {
  const wrongKind = (kind: string) =>
    debugAnswer(
      args,
      async () => {
        throw new Error(
          `what: ${args.what} does not apply to an ${kind} debug session`,
        );
      },
      (v) => v,
    );
  return branchByKind(
    context,
    args,
    {
      amdp: (d) => {
        if (args.what !== 'table') return wrongKind('amdp');
        return debugAnswer(
          args,
          async () => {
            // The schema cannot tie names to what: a table needs its first entry.
            const name = args.names?.[0];
            if (!name?.trim())
              throw new Error('names: the table variable to read, first entry');
            return d.amdp.getTable(name);
          },
          (v) => v.rows,
        );
      },
      abap: (d) => {
        switch (args.what) {
          case 'stack':
            return debugAnswer(
              args,
              async () => d.abap.getStack(),
              (stop) => terseStop(stop.debuggee, stop.stack),
            );
          case 'variables': {
            const names = args.names?.length ? args.names : undefined;
            const byName = names !== undefined;
            return debugAnswer(
              args,
              async () =>
                names
                  ? d.abap.getVariables(names)
                  : d.abap.getChildVariables(['@ROOT']),
              (v) => {
                if (byName) return terseVariables(v);
                // Every member keeps the id a further read takes as a parent.
                const variables = new Map(
                  terseVariables(v).map((t) => [t.id, t]),
                );
                return v.children.map(
                  (c) =>
                    variables.get(c.child) ?? { id: c.child, label: c.label },
                );
              },
            );
          }
          case 'memory':
            return debugAnswer(
              args,
              async () => d.abap.getMemorySizes(),
              readXmlDocument,
              readXmlDocument,
            );
          default:
            return wrongKind('abap');
        }
      },
    },
    failedAnswer(args),
  );
}
