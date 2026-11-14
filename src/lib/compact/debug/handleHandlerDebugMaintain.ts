import * as z from 'zod';
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
import type { HandlerContext } from '../../handlers/index';
import { listedValues } from '../../handlers/listedValues';
import { DETAIL_SHAPE } from '../../strategies/detail';
import { either, textsOf } from '../memberTexts';
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

/** Every operation `operation` takes, either kind's. */
export const MAINTAIN_OPERATIONS = [
  ...ABAP_OPERATIONS,
  ...AMDP_OPERATIONS,
] as const;
type MaintainOperation = (typeof MAINTAIN_OPERATIONS)[number];

/** Each abap operation's clause of the description. */
const ABAP_CLAUSES: ReadonlyArray<readonly [MaintainOperation, string]> = [
  [
    'getStack',
    'getStack answers the frames, each with its program, include, line and ADT address, the stopped position on top',
  ],
  [
    'getVariables',
    'getVariables answers the variables in names (a path reads a component or a table row)',
  ],
  [
    'getChildVariables',
    'getChildVariables answers the members of the ids in parents, the scopes (@ROOT) when parents is omitted',
  ],
  ['getMemorySizes', 'getMemorySizes answers the memory sizes'],
  ['createMemorySnapshot', 'createMemorySnapshot creates a memory snapshot'],
  [
    'setVariableValue',
    'setVariableValue sets variable_name to value and answers the variable',
  ],
];

/** Each operation's words in `operation`'s description. */
const OPERATION_WORDS: ReadonlyArray<readonly [MaintainOperation, string]> = [
  ['getStack', 'getStack (the stack)'],
  ['getVariables', 'getVariables (variables by name)'],
  ['getChildVariables', 'getChildVariables (child variables)'],
  ['getMemorySizes', 'getMemorySizes (memory sizes)'],
  ['createMemorySnapshot', 'createMemorySnapshot (a snapshot)'],
  ['setVariableValue', 'setVariableValue (set a value)'],
];

/**
 * `HandlerDebugMaintain`'s description and schema with `operations`: each
 * text names only the operations given, a property only one of them takes.
 */
export function handlerDebugMaintainDefinition(
  operations: readonly MaintainOperation[],
) {
  const abap = textsOf(operations, ABAP_CLAUSES);
  const preview = operations.includes('getDataPreview');
  const setValue = operations.includes('setVariableValue');
  const request = [
    ...(textsOf(operations, OPERATION_WORDS).length > 0
      ? [`abap ${either(textsOf(operations, OPERATION_WORDS))}`]
      : []),
    ...(preview
      ? ['amdp getDataPreview (the data preview of a table variable)']
      : []),
  ];
  const variableName = [
    ...(setValue ? ['abap setVariableValue: the variable set.'] : []),
    ...(preview ? ['amdp getDataPreview: the table variable read.'] : []),
  ];
  return {
    description: `Reads and changes the stopped debuggee: each call sends one SAP request, chosen by operation.${abap.length > 0 ? ` kind abap, on the attached debuggee: ${abap.join('; ')}.` : ''}${preview ? ' kind amdp: getDataPreview answers the rows of the table variable variable_name of debuggee_id.' : ''}`,
    inputSchema: z.object({
      ...STATE_HANDLE_PROPERTY,
      ...KIND_PROPERTY,
      operation: listedValues(operations).describe(
        `What the call does: ${request.join('; ')}.`,
      ),
      ...(operations.includes('getVariables')
        ? {
            names: z
              .array(z.string())
              .optional()
              .describe('abap getVariables: the variables read.'),
          }
        : {}),
      ...(operations.includes('getChildVariables')
        ? {
            parents: z
              .array(z.string())
              .optional()
              .describe(
                'abap getChildVariables: the ids whose members are read; @ROOT, the scopes, when omitted.',
              ),
          }
        : {}),
      ...(variableName.length > 0
        ? {
            variable_name: z
              .string()
              .optional()
              .describe(variableName.join(' ')),
          }
        : {}),
      ...(setValue
        ? {
            value: z
              .string()
              .optional()
              .describe('abap setVariableValue: the new value.'),
          }
        : {}),
      ...(preview ? PREVIEW_PROPERTIES : {}),
      ...DETAIL_SHAPE,
    }),
  };
}

const PREVIEW_PROPERTIES = {
  debuggee_id: z
    .string()
    .optional()
    .describe('amdp getDataPreview: the debuggee id of the break event.'),
  query: z
    .string()
    .optional()
    .describe(
      'amdp getDataPreview: a SELECT over the table variable; every column when omitted.',
    ),
  row_number: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "amdp getDataPreview: how many rows SAP answers; SAP's own count when omitted.",
    ),
};

export const TOOL_DEFINITION = {
  name: 'HandlerDebugMaintain',
  available_in: ['onprem', 'cloud'] as const,
  description: handlerDebugMaintainDefinition(MAINTAIN_OPERATIONS).description,
  inputSchema: z.object({
    ...STATE_HANDLE_PROPERTY,
    ...KIND_PROPERTY,
    operation: listedValues(MAINTAIN_OPERATIONS).describe(
      'What the call does: abap getStack (the stack), getVariables (variables by name), getChildVariables (child variables), getMemorySizes (memory sizes), createMemorySnapshot (a snapshot) or setVariableValue (set a value); amdp getDataPreview (the data preview of a table variable).',
    ),
    names: z
      .array(z.string())
      .optional()
      .describe('abap getVariables: the variables read.'),
    parents: z
      .array(z.string())
      .optional()
      .describe(
        'abap getChildVariables: the ids whose members are read; @ROOT, the scopes, when omitted.',
      ),
    variable_name: z
      .string()
      .optional()
      .describe(
        'abap setVariableValue: the variable set. amdp getDataPreview: the table variable read.',
      ),
    value: z
      .string()
      .optional()
      .describe('abap setVariableValue: the new value.'),
    ...PREVIEW_PROPERTIES,
    ...DETAIL_SHAPE,
  }),
} as const;

type Args = z.output<typeof TOOL_DEFINITION.inputSchema>;

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
        const options = {
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
        };
        return recorder !== undefined
          ? d.amdp.recordDataPreviewOnce(recorder, options)
          : d.amdp.getDataPreviewOnce(options);
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
