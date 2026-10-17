import {
  debugBatchRecorder,
  placeOf,
  readMemorySizes,
  readXmlDocument,
  STATE_HANDLE_PROPERTY,
  terseFrames,
  terseMemorySizes,
  terseVariables,
} from '../../debugger/index';
import type { ArgsOf, HandlerContext } from '../../handlers/index';
import { DETAIL_PROPERTY } from '../index';
import { KIND_PROPERTY, needed, onceAnswer, refuseOperation } from './shared';

const ABAP_OPERATIONS = [
  'getStack',
  'getVariables',
  'getChildVariables',
  'getMemorySizes',
  'createMemorySnapshot',
  'setVariableValue',
] as const;
const AMDP_OPERATIONS = ['getDataPreview'] as const;

export const TOOL_DEFINITION = {
  name: 'HandlerDebugMaintain',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Reads and changes the stopped debuggee: each call sends one SAP request, chosen by operation. kind abap, on the attached debuggee: getStack answers the frames, each with its program, include, line and ADT address, the stopped position on top; getVariables answers the variables in names (a path reads a component or a table row); getChildVariables answers the members of the ids in parents, the scopes (@ROOT) when parents is omitted; getMemorySizes answers the memory sizes; createMemorySnapshot creates a memory snapshot; setVariableValue sets variable_name to value and answers the variable. kind amdp: getDataPreview answers the rows of the table variable variable_name of debuggee_id.',
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      ...KIND_PROPERTY,
      operation: {
        type: 'string',
        enum: [...ABAP_OPERATIONS, 'getDataPreview'],
        description:
          'What the call does: abap getStack (the stack), getVariables (variables by name), getChildVariables (child variables), getMemorySizes (memory sizes), createMemorySnapshot (a snapshot) or setVariableValue (set a value); amdp getDataPreview (the data preview of a table variable).',
      },
      names: {
        type: 'array',
        items: { type: 'string' },
        description: 'abap getVariables: the variables read.',
      },
      parents: {
        type: 'array',
        items: { type: 'string' },
        description:
          'abap getChildVariables: the ids whose members are read; @ROOT, the scopes, when omitted.',
      },
      variable_name: {
        type: 'string',
        description:
          'abap setVariableValue: the variable set. amdp getDataPreview: the table variable read.',
      },
      value: {
        type: 'string',
        description: 'abap setVariableValue: the new value.',
      },
      debuggee_id: {
        type: 'string',
        description: 'amdp getDataPreview: the debuggee id of the break event.',
      },
      query: {
        type: 'string',
        description:
          'amdp getDataPreview: a SELECT over the table variable; every column when omitted.',
      },
      row_number: {
        type: 'integer',
        minimum: 1,
        description:
          "amdp getDataPreview: how many rows SAP answers; SAP's own count when omitted.",
      },
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle', 'kind', 'operation'],
  },
} as const;

type Args = ArgsOf<typeof TOOL_DEFINITION.inputSchema>;

/** An empty value is a value; only an absent one is refused. */
function newValueOf(value: string | undefined): string {
  if (value === undefined)
    throw new Error('value: needed for setVariableValue');
  return value;
}

export async function handleHandlerDebugMaintain(
  context: HandlerContext,
  args: Args,
) {
  const op = args.operation;
  // Recorded in the debugger batch: each operation's own request.
  const recorder = debugBatchRecorder(context);
  if (args.kind === 'amdp') {
    return onceAnswer(
      context,
      args,
      'amdp',
      false,
      async (d) => {
        if (op !== 'getDataPreview')
          refuseOperation('amdp', op, AMDP_OPERATIONS);
        return d.amdp.getDataPreviewOnce({
          debuggeeId: needed(
            args.debuggee_id,
            'debuggee_id: needed for getDataPreview',
          ),
          variable: needed(
            args.variable_name,
            'variable_name: needed for getDataPreview',
          ),
          ...(args.query ? { query: args.query } : {}),
          ...(args.row_number !== undefined
            ? { rowNumber: args.row_number }
            : {}),
        });
      },
      (v) => v.rows,
    );
  }
  switch (op) {
    case 'getStack':
      return onceAnswer(
        context,
        args,
        'abap',
        false,
        async (d) =>
          recorder !== undefined
            ? d.abap.recordStack(recorder)
            : d.abap.getStack(),
        (stop) => {
          const top = stop.stack.frames[0];
          const kept = terseFrames(stop.stack.frames, placeOf);
          return {
            ...(top ? { at: placeOf(top) } : {}),
            frames: kept.frames,
            ...(kept.depth ? { stack_depth: kept.depth } : {}),
          };
        },
      );
    case 'getVariables':
      return onceAnswer(
        context,
        args,
        'abap',
        false,
        async (d) => {
          const names = args.names ?? [];
          if (!names.length)
            throw new Error('names: needed for getVariables, at least one');
          return recorder !== undefined
            ? d.abap.recordVariables(recorder, names)
            : d.abap.getVariables(names);
        },
        terseVariables,
      );
    case 'getChildVariables':
      return onceAnswer(
        context,
        args,
        'abap',
        false,
        async (d) => {
          const parents = args.parents?.length ? args.parents : ['@ROOT'];
          return recorder !== undefined
            ? d.abap.recordChildVariables(recorder, parents)
            : d.abap.getChildVariables(parents);
        },
        (v) => {
          // Every member keeps the id a further read takes as a parent.
          const variables = new Map(terseVariables(v).map((t) => [t.id, t]));
          return v.children.map(
            (c) => variables.get(c.child) ?? { id: c.child, label: c.label },
          );
        },
      );
    case 'getMemorySizes':
      return onceAnswer(
        context,
        args,
        'abap',
        false,
        async (d) => d.abap.getMemorySizes(),
        (xml) => terseMemorySizes(readMemorySizes(xml)),
      );
    case 'createMemorySnapshot':
      return onceAnswer(
        context,
        args,
        'abap',
        false,
        async (d) => d.abap.createMemorySnapshot(),
        readXmlDocument,
      );
    case 'setVariableValue':
      return onceAnswer(
        context,
        args,
        'abap',
        false,
        async (d) => {
          const name = needed(
            args.variable_name,
            'variable_name: needed for setVariableValue',
          );
          const value = newValueOf(args.value);
          return recorder !== undefined
            ? d.abap.recordSetVariable(recorder, name, value)
            : d.abap.setVariable(name, value);
        },
        terseVariables,
      );
    default:
      return onceAnswer(context, args, 'abap', false, async () =>
        refuseOperation('abap', op, ABAP_OPERATIONS),
      );
  }
}
