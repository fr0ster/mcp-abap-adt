import * as z from 'zod';
import {
  SETTINGS_OBJECT,
  settingsFromArgs,
  terseAmdpEvent,
} from '../../debugger/index';
import {
  type DescriptionParts,
  pairsPurpose,
  toolDescription,
} from '../../description/index';
import type { HandlerContext } from '../../handlers/index';
import { listedValues } from '../../handlers/listedValues';
import { DETAIL_SHAPE } from '../../strategies/detail';
import { either, listed } from '../memberTexts';
import {
  endAnswer,
  IDENTITY_PROPERTIES,
  identityOf,
  KIND_PROPERTY,
  needed,
  onceAnswer,
  openingStateHandleProperty,
  refuseOperation,
} from './shared';

const ABAP_OPERATIONS = [
  'checkListener',
  'listen',
  'stopListener',
  'attach',
  'detachDebugger',
  'terminateDebuggee',
  'terminateDebugger',
  'setDebuggerSettings',
] as const;
const AMDP_OPERATIONS = [
  'start',
  'getEvents',
  'stop',
  'deleteDebuggee',
] as const;
/** Both kinds: the end of the debug state. */
const END = 'end' as const;

/** Every operation `operation` takes, either kind's, and `end`. */
export const SESSION_OPERATIONS = [
  ...ABAP_OPERATIONS,
  ...AMDP_OPERATIONS,
  END,
] as const;
type SessionOperation = (typeof SESSION_OPERATIONS)[number];

/** Each operation as an action and object pair (owner). */
const PAIRS: { readonly [K in SessionOperation]: string } = {
  checkListener:
    "checks whether another debugger holds this identity's debugging",
  listen: 'listens for an ABAP debuggee',
  stopListener: 'stops the ABAP listener',
  attach: 'attaches an ABAP debuggee',
  detachDebugger: 'detaches the debugger from the debuggee',
  terminateDebuggee: 'terminates the ABAP debuggee',
  terminateDebugger: 'terminates the debugger',
  setDebuggerSettings: 'sets the debugger settings',
  start: 'starts an AMDP debug session',
  getEvents: "gets the AMDP session's events",
  stop: 'stops the AMDP debug session',
  deleteDebuggee: 'deletes an AMDP debuggee',
  end: 'ends the debug state',
};

/** `HandlerDebugSession`'s parts with `operations`: each by its function. */
export function handlerDebugSessionParts(
  operations: readonly SessionOperation[],
): DescriptionParts {
  return {
    tag: 'debug',
    purpose: pairsPurpose(operations.map((op) => PAIRS[op])),
  };
}

/** The operations of the opening state handle's description, for those left. */
function openingWords(has: (op: SessionOperation) => boolean): string {
  const abap = (
    ['checkListener', 'listen', 'stopListener', 'attach'] as const
  ).filter(has);
  const parts = [
    ...(abap.length > 0 ? [`abap ${listed(abap)}`] : []),
    ...(has('start') ? ['amdp start'] : []),
  ];
  return parts.length === 2 ? `${parts.join(', and ')},` : parts.join('');
}

/**
 * `HandlerDebugSession`'s description and schema with `operations`: each
 * text names only the operations given, a property only one of them takes.
 */
export function handlerDebugSessionDefinition(
  operations: readonly SessionOperation[],
) {
  const has = (op: SessionOperation) => operations.includes(op);
  const abapOps = ABAP_OPERATIONS.filter(has);
  const amdpOps = AMDP_OPERATIONS.filter(has);
  const request = [
    ...(abapOps.length > 0 ? [`abap ${either(abapOps)}`] : []),
    ...(amdpOps.length > 0 ? [`amdp ${either(amdpOps)}`] : []),
  ];
  const opening = openingWords(has);
  const takeOver = [
    ...(has('listen')
      ? [
          'abap listen: true displaces another debugger listening for the same user; false, or omitted, answers its 409.',
        ]
      : []),
    ...(has('start')
      ? ['amdp start: true ends an AMDP session of this user left behind.']
      : []),
  ];
  const debuggee = [
    ...(has('attach')
      ? [
          `abap attach: ${has('listen') ? 'the debuggee_id listen answered' : 'the id of the debuggee attached'}.`,
        ]
      : []),
    ...(has('deleteDebuggee')
      ? ['amdp deleteDebuggee: the debuggee id of a break event.']
      : []),
  ];
  return {
    description: toolDescription(handlerDebugSessionParts(operations)),
    inputSchema: z.object({
      ...(opening.length > 0
        ? openingStateHandleProperty(opening)
        : OWN_STATE_HANDLE),
      ...KIND_PROPERTY,
      operation: listedValues(operations).describe(
        `The one request: ${request.join('; ')}.${has(END) ? ' end, for either kind, logs off the debug state.' : ''}`,
      ),
      ...(has('listen')
        ? {
            hold_seconds: z
              .number()
              .int()
              .min(0)
              .optional()
              .describe(
                'abap listen: how long SAP holds the listen, in seconds; SAP answers at a catch or when the hold ends.',
              ),
          }
        : {}),
      ...(takeOver.length > 0
        ? {
            take_over: z.boolean().optional().describe(takeOver.join(' ')),
          }
        : {}),
      ...(debuggee.length > 0
        ? {
            debuggee_id: z.string().optional().describe(debuggee.join(' ')),
          }
        : {}),
      ...(has('attach')
        ? {
            server: z
              .string()
              .optional()
              .describe(
                `abap attach: the debuggee's application server${has('listen') ? ', as listen answered it' : ''}.`,
              ),
          }
        : {}),
      ...(has('setDebuggerSettings')
        ? {
            settings: SETTINGS_OBJECT.optional().describe(
              'abap setDebuggerSettings: the settings sent; a field left out keeps its value.',
            ),
          }
        : {}),
      ...IDENTITY_PROPERTIES,
      ...DETAIL_SHAPE,
    }),
  };
}

/** The handle where no operation left opens the debug state. */
const OWN_STATE_HANDLE = {
  state_handle: z
    .string()
    .optional()
    .describe(
      "The handle of this server's debug state; every operation takes it.",
    ),
};

export const TOOL_DEFINITION = {
  name: 'HandlerDebugSession',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(handlerDebugSessionParts(SESSION_OPERATIONS)),
  inputSchema: z.object({
    ...openingStateHandleProperty(
      'abap checkListener, listen, stopListener and attach, and amdp start,',
    ),
    ...KIND_PROPERTY,
    operation: z
      .enum([
        ...ABAP_OPERATIONS,
        'start',
        'getEvents',
        'stop',
        'deleteDebuggee',
        END,
      ])
      .describe(
        'The one request: abap checkListener, listen, stopListener, attach, detachDebugger, terminateDebuggee, terminateDebugger or setDebuggerSettings; amdp start, getEvents, stop or deleteDebuggee. end, for either kind, logs off the debug state.',
      ),
    hold_seconds: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'abap listen: how long SAP holds the listen, in seconds; SAP answers at a catch or when the hold ends.',
      ),
    take_over: z
      .boolean()
      .optional()
      .describe(
        'abap listen: true displaces another debugger listening for the same user; false, or omitted, answers its 409. amdp start: true ends an AMDP session of this user left behind.',
      ),
    debuggee_id: z
      .string()
      .optional()
      .describe(
        'abap attach: the debuggee_id listen answered. amdp deleteDebuggee: the debuggee id of a break event.',
      ),
    server: z
      .string()
      .optional()
      .describe(
        "abap attach: the debuggee's application server, as listen answered it.",
      ),
    settings: SETTINGS_OBJECT.optional().describe(
      'abap setDebuggerSettings: the settings sent; a field left out keeps its value.',
    ),
    ...IDENTITY_PROPERTIES,
    ...DETAIL_SHAPE,
  }),
} as const;

type Args = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleHandlerDebugSession(
  context: HandlerContext,
  args: Args,
) {
  const op = args.operation;
  if (op === END) return endAnswer(context, args);
  if (args.kind === 'amdp') {
    switch (op) {
      case 'start':
        return onceAnswer(
          context,
          args,
          'amdp',
          true,
          async (d) => d.amdp.startOnce(args.take_over ?? false),
          (v) => ({ main_id: v.mainId, hana_session: v.hanaSession }),
        );
      case 'getEvents':
        return onceAnswer(
          context,
          args,
          'amdp',
          false,
          async (d) => d.amdp.getEventsOnce(),
          (events) => ({ events: events.map(terseAmdpEvent) }),
        );
      case 'stop':
        return onceAnswer(context, args, 'amdp', false, async (d) =>
          d.amdp.stopOnce(),
        );
      case 'deleteDebuggee':
        return onceAnswer(context, args, 'amdp', false, async (d) =>
          d.amdp.deleteDebuggeeOnce(
            needed(args.debuggee_id, 'debuggee_id: needed for deleteDebuggee'),
          ),
        );
      default:
        return onceAnswer(context, args, 'amdp', false, async () =>
          refuseOperation('amdp', op, AMDP_OPERATIONS),
        );
    }
  }
  const identity = () => identityOf(args);
  switch (op) {
    case 'checkListener':
      return onceAnswer(context, args, 'abap', true, async (d) =>
        d.abap.checkListenerOnce(identity()),
      );
    case 'listen':
      return onceAnswer(
        context,
        args,
        'abap',
        true,
        async (d) =>
          d.abap.listenOnce(
            identity(),
            needed(args.hold_seconds, 'hold_seconds: needed for listen'),
            args.take_over ? 'takeOver' : 'refuse',
          ),
        (v) =>
          'caught' in v
            ? v
            : {
                caught: true,
                debuggee_id: v.debuggeeId,
                server: v.instance,
                user: v.user,
                program: v.program,
                include: v.include,
                line: v.line,
                uri: v.uri,
                ...(v.attachImpossible ? { attach_impossible: true } : {}),
                ...(v.dump ? { dump: v.dump } : {}),
              },
      );
    case 'stopListener':
      return onceAnswer(context, args, 'abap', true, async (d) =>
        d.abap.stopListenerOnce(identity()),
      );
    case 'attach':
      return onceAnswer(context, args, 'abap', true, async (d) =>
        d.abap.attachOnce(
          identity(),
          needed(args.debuggee_id, 'debuggee_id: needed for attach'),
          args.server,
        ),
      );
    case 'detachDebugger':
      return onceAnswer(context, args, 'abap', false, async (d) =>
        d.abap.detachOnce(),
      );
    case 'terminateDebuggee':
      return onceAnswer(context, args, 'abap', false, async (d) =>
        d.abap.terminateDebuggeeOnce(),
      );
    case 'terminateDebugger':
      return onceAnswer(context, args, 'abap', false, async (d) =>
        d.abap.terminateDebuggerOnce(),
      );
    case 'setDebuggerSettings':
      return onceAnswer(context, args, 'abap', false, async (d) =>
        d.abap.setDebuggerSettingsOnce(
          settingsFromArgs(
            needed(args.settings, 'settings: needed for setDebuggerSettings'),
          ),
        ),
      );
    default:
      return onceAnswer(context, args, 'abap', false, async () =>
        refuseOperation('abap', op, ABAP_OPERATIONS),
      );
  }
}
