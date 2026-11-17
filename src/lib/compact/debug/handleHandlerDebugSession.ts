import * as z from 'zod';
import {
  SETTINGS_OBJECT,
  settingsFromArgs,
  terseAmdpEvent,
} from '../../debugger/index';
import type { HandlerContext } from '../../handlers/index';
import { listedValues } from '../../handlers/listedValues';
import { DETAIL_SHAPE } from '../../strategies/detail';
import { either, listed, textsOf } from '../memberTexts';
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

/** Each abap operation's clause of the description. */
const ABAP_CLAUSES: ReadonlyArray<readonly [SessionOperation, string]> = [
  [
    'checkListener',
    "checkListener answers whether another debugger holds this identity's debugging (SAP's 409 names the holder)",
  ],
  [
    'listen',
    "listen waits for a debuggee for exactly hold_seconds, SAP's hold, and answers the debuggee caught (debuggee_id, its server) or caught: false; a breakpoint stops a program while a listen is open",
  ],
  [
    'stopListener',
    "stopListener ends the listener and deletes the identity's breakpoints",
  ],
  [
    'attach',
    'attach attaches debuggee_id on the attaching session, which the first attach opens and every later attach, step and reading uses',
  ],
  [
    'detachDebugger',
    'detachDebugger sends detachDebugger on the attaching session, which releases the debuggee, and the program runs on',
  ],
];

/** Each amdp operation's clause of the description. */
const AMDP_CLAUSES: ReadonlyArray<readonly [SessionOperation, string]> = [
  [
    'start',
    'start opens an AMDP session for the connected SAP user and answers its main_id',
  ],
  [
    'getEvents',
    'getEvents answers the events SAP sends (breaks with their debuggee ids, breakpoint confirmations, ends)',
  ],
  ['stop', 'stop ends the AMDP session'],
  ['deleteDebuggee', 'deleteDebuggee cancels the execution of debuggee_id'],
];

/** The clause of the two terminations, for those left. */
function terminations(has: (op: SessionOperation) => boolean): string[] {
  const parts = [
    ...(has('terminateDebuggee')
      ? ['terminateDebuggee ends the debuggee where it stands']
      : []),
    ...(has('terminateDebugger')
      ? ['terminateDebugger frees the debugger']
      : []),
  ];
  return parts.length === 0
    ? []
    : [
        `${parts.join(' and ')}; ${parts.length === 1 ? 'it answers' : 'each answers'} SAP's answer as it came, which is a 500 when it succeeded, and the next answer shows the success (noSessionAttached, or the program's end)`,
      ];
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
  const abapClauses = [
    ...textsOf(operations, ABAP_CLAUSES),
    ...terminations(has),
    ...(has('setDebuggerSettings')
      ? [
          'setDebuggerSettings sends the settings given at the attached debuggee',
        ]
      : []),
  ];
  const amdpClauses = textsOf(operations, AMDP_CLAUSES);
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
    description: `Debugger listener and session. Each operation${has(END) ? ' up to end' : ''} sends one SAP request, the operation's, and answers what SAP answered.${abapClauses.length > 0 ? ` kind abap: ${abapClauses.join('; ')}.` : ''}${amdpClauses.length > 0 ? ` kind amdp: ${amdpClauses.join('; ')}.` : ''}${has(END) ? ` end, for either kind, takes state_handle and logs off each connection the debug state opened, one logoff each: an attached debuggee runs on, an AMDP debug session ends, and the user's breakpoints stay set${has('stopListener') ? ' until stopListener removes them' : ''}; the debug state and its handle end with it, and a new debug state of either kind and any identity opens after it.` : ''} The answer carries state_handle while the debug state holds something, and for abap the identity in force.`,
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
  description: handlerDebugSessionDefinition(SESSION_OPERATIONS).description,
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
