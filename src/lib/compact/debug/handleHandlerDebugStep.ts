import * as z from 'zod';
import {
  debugBatchRecorder,
  LINE_TARGET_PROPERTIES,
  lineUriOf,
  STATE_HANDLE_PROPERTY,
  terseOnceStep,
} from '../../debugger/index';
import type { HandlerContext } from '../../handlers/index';
import { listedValues } from '../../handlers/listedValues';
import { DETAIL_SHAPE } from '../../strategies/detail';
import { either, listed } from '../memberTexts';
import { KIND_PROPERTY, needed, onceAnswer, refuseOperation } from './shared';

const ABAP_OPERATIONS = [
  'stepInto',
  'stepOver',
  'stepReturn',
  'stepContinue',
  'stepRunToLine',
  'stepJumpToLine',
  'setStackPosition',
] as const;
const AMDP_OPERATIONS = ['stepOver', 'stepContinue'] as const;

/** Every operation `operation` takes, either kind's. */
export const STEP_OPERATIONS = [...ABAP_OPERATIONS] as const;
type StepOperation = (typeof STEP_OPERATIONS)[number];

/** The abap part of the description, for the operations left. */
function abapWords(left: readonly StepOperation[]): string {
  const steps = left.filter(
    (op) =>
      op === 'stepInto' ||
      op === 'stepOver' ||
      op === 'stepReturn' ||
      op === 'stepContinue',
  );
  const toLine = left.includes('stepRunToLine');
  const jump = left.includes('stepJumpToLine');
  const clauses = [
    ...(steps.length > 0
      ? [
          `${listed(steps)} ${steps.length === 1 ? 'steps' : 'step'} from where it stands`,
        ]
      : []),
    ...(toLine && jump
      ? [
          'stepRunToLine runs to the line object_type, object_name and line name, stepJumpToLine moves there and skips what lies between',
        ]
      : toLine
        ? [
            'stepRunToLine runs to the line object_type, object_name and line name',
          ]
        : jump
          ? [
              'stepJumpToLine moves to the line object_type, object_name and line name and skips what lies between',
            ]
          : []),
  ];
  const sentences = [
    ...(clauses.length > 0
      ? [
          `${clauses.join('; ')}; a step answers SAP's step result, or ended when SAP reports the program's end, and the stopped position is read from the stack.`,
        ]
      : []),
    ...(left.includes('setStackPosition')
      ? ['setStackPosition makes frame position the one variables are read in.']
      : []),
  ];
  return sentences.length === 0
    ? ''
    : ` kind abap, on the attached debuggee: ${sentences.join(' ')}`;
}

/**
 * `HandlerDebugStep`'s description and schema with `operations`: each text
 * names only the operations given, a property only one of them takes.
 */
export function handlerDebugStepDefinition(
  operations: readonly StepOperation[],
) {
  const amdp = AMDP_OPERATIONS.filter((op) => operations.includes(op));
  const abap = ABAP_OPERATIONS.filter((op) => operations.includes(op));
  const lines =
    operations.includes('stepRunToLine') ||
    operations.includes('stepJumpToLine');
  const request = [
    ...(abap.length > 0 ? [`abap ${either(abap)}`] : []),
    ...(amdp.length > 0 ? [`amdp ${either(amdp)}`] : []),
  ];
  return {
    description: `Moves the stopped debuggee: each call sends one SAP request, the operation's.${abapWords(operations)}${amdp.length > 0 ? ` kind amdp: ${listed(amdp)} ${amdp.length === 1 ? 'moves' : 'move'} debuggee_id and ${amdp.length === 1 ? 'answers' : 'answer'} the request id; the next stop arrives as a break event.` : ''}`,
    inputSchema: z.object({
      ...STATE_HANDLE_PROPERTY,
      ...KIND_PROPERTY,
      operation: listedValues(operations).describe(
        `The one request: ${request.join('; ')}.`,
      ),
      ...(lines ? LINE_TARGET_PROPERTIES : {}),
      ...(operations.includes('setStackPosition')
        ? {
            position: z
              .number()
              .int()
              .optional()
              .describe(
                "abap setStackPosition: the frame's position in the stack.",
              ),
          }
        : {}),
      ...(amdp.length > 0
        ? {
            debuggee_id: z
              .string()
              .optional()
              .describe('amdp: the debuggee id of the break event.'),
          }
        : {}),
      ...DETAIL_SHAPE,
    }),
  };
}

export const TOOL_DEFINITION = {
  name: 'HandlerDebugStep',
  available_in: ['onprem', 'cloud'] as const,
  description: handlerDebugStepDefinition(STEP_OPERATIONS).description,
  inputSchema: z.object({
    ...STATE_HANDLE_PROPERTY,
    ...KIND_PROPERTY,
    operation: listedValues(STEP_OPERATIONS).describe(
      'The one request: abap stepInto, stepOver, stepReturn, stepContinue, stepRunToLine, stepJumpToLine or setStackPosition; amdp stepOver or stepContinue.',
    ),
    ...LINE_TARGET_PROPERTIES,
    position: z
      .number()
      .int()
      .optional()
      .describe("abap setStackPosition: the frame's position in the stack."),
    debuggee_id: z
      .string()
      .optional()
      .describe('amdp: the debuggee id of the break event.'),
    ...DETAIL_SHAPE,
  }),
} as const;

type Args = z.output<typeof TOOL_DEFINITION.inputSchema>;

const STEPS = {
  stepInto: 'stepInto',
  stepOver: 'stepOver',
  stepReturn: 'stepReturn',
  stepContinue: 'stepContinue',
} as const;

export async function handleHandlerDebugStep(
  context: HandlerContext,
  args: Args,
) {
  const op = args.operation;
  // Recorded in the debugger batch: each operation's own request.
  const recorder = debugBatchRecorder(context);
  if (args.kind === 'amdp') {
    return onceAnswer(context, args, 'amdp', false, async (d) => {
      if (op !== 'stepOver' && op !== 'stepContinue')
        refuseOperation('amdp', op, AMDP_OPERATIONS);
      const debuggee = needed(
        args.debuggee_id,
        `debuggee_id: needed for ${op}`,
      );
      const step = op === 'stepOver' ? 'over' : 'continue';
      return recorder !== undefined
        ? d.amdp.recordStepOnce(recorder, debuggee, step)
        : d.amdp.stepOnce(debuggee, step);
    });
  }
  switch (op) {
    case 'stepInto':
    case 'stepOver':
    case 'stepReturn':
    case 'stepContinue':
      return onceAnswer(
        context,
        args,
        'abap',
        false,
        async (d) =>
          recorder !== undefined
            ? d.abap.recordStep(recorder, STEPS[op])
            : d.abap.stepOnce(STEPS[op]),
        terseOnceStep,
      );
    case 'stepRunToLine':
    case 'stepJumpToLine':
      return onceAnswer(
        context,
        args,
        'abap',
        false,
        async (d) => {
          // The line's address is the caller's: the schema cannot tie it to these two.
          const what = `object_type, object_name and line: needed for ${op}`;
          const uri = lineUriOf(
            {
              object_type: needed(args.object_type, what),
              object_name: needed(args.object_name, what),
              include: args.include,
              parent_name: args.parent_name,
            },
            needed(args.line, what),
          );
          return recorder !== undefined
            ? d.abap.recordStepToLine(recorder, op, uri)
            : d.abap.stepToLineOnce(op, uri);
        },
        terseOnceStep,
      );
    case 'setStackPosition':
      return onceAnswer(context, args, 'abap', false, async (d) => {
        const position = needed(
          args.position,
          'position: needed for setStackPosition',
        );
        return recorder !== undefined
          ? d.abap.recordStackPosition(recorder, position)
          : d.abap.setStackPositionOnce(position);
      });
    default:
      return onceAnswer(context, args, 'abap', false, async () =>
        refuseOperation('abap', op, ABAP_OPERATIONS),
      );
  }
}
