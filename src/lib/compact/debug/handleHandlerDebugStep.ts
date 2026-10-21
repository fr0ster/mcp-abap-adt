import {
  debugBatchRecorder,
  LINE_TARGET_PROPERTIES,
  lineUriOf,
  STATE_HANDLE_PROPERTY,
  terseOnceStep,
} from '../../debugger/index';
import type { ArgsOf, HandlerContext } from '../../handlers/index';
import { DETAIL_PROPERTY } from '../index';
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

export const TOOL_DEFINITION = {
  name: 'HandlerDebugStep',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "[read-only] Moves the stopped debuggee: each call sends one SAP request, the operation's. kind abap, on the attached debuggee: stepInto, stepOver, stepReturn and stepContinue step from where it stands; stepRunToLine runs to the line object_type, object_name and line name, stepJumpToLine moves there and skips what lies between; a step answers SAP's step result, or ended when SAP reports the program's end, and the stopped position is read from the stack. setStackPosition makes frame position the one variables are read in. kind amdp: stepOver and stepContinue move debuggee_id and answer the request id; the next stop arrives as a break event.",
  inputSchema: {
    type: 'object',
    properties: {
      ...STATE_HANDLE_PROPERTY,
      ...KIND_PROPERTY,
      operation: {
        type: 'string',
        enum: [...ABAP_OPERATIONS],
        description:
          'The one request: abap stepInto, stepOver, stepReturn, stepContinue, stepRunToLine, stepJumpToLine or setStackPosition; amdp stepOver or stepContinue.',
      },
      ...LINE_TARGET_PROPERTIES,
      position: {
        type: 'integer',
        description:
          "abap setStackPosition: the frame's position in the stack.",
      },
      debuggee_id: {
        type: 'string',
        description: 'amdp: the debuggee id of the break event.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['state_handle', 'kind', 'operation'],
  },
} as const;

type Args = ArgsOf<typeof TOOL_DEFINITION.inputSchema>;

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
