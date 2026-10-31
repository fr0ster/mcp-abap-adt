import {
  SETTINGS_FIELDS,
  settingsFromArgs,
  terseAmdpEvent,
} from '../../debugger/index';
import type { ArgsOf, HandlerContext } from '../../handlers/index';
import { DETAIL_PROPERTY } from '../index';
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

export const TOOL_DEFINITION = {
  name: 'HandlerDebugSession',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Debugger listener and session. Each operation up to end sends one SAP request, the operation's, and answers what SAP answered. kind abap: checkListener answers whether another debugger holds this identity's debugging (SAP's 409 names the holder); listen waits for a debuggee for exactly hold_seconds, SAP's hold, and answers the debuggee caught (debuggee_id, its server) or caught: false; a breakpoint stops a program while a listen is open; stopListener ends the listener and deletes the identity's breakpoints; attach attaches debuggee_id on the attaching session, which the first attach opens and every later attach, step and reading uses; detachDebugger sends detachDebugger on the attaching session, which releases the debuggee, and the program runs on; terminateDebuggee ends the debuggee where it stands and terminateDebugger frees the debugger; each answers SAP's answer as it came, which is a 500 when it succeeded, and the next answer shows the success (noSessionAttached, or the program's end); setDebuggerSettings sends the settings given at the attached debuggee. kind amdp: start opens an AMDP session for the connected SAP user and answers its main_id; getEvents answers the events SAP sends (breaks with their debuggee ids, breakpoint confirmations, ends); stop ends the AMDP session; deleteDebuggee cancels the execution of debuggee_id. end, for either kind, takes state_handle and logs off each connection the debug state opened, one logoff each: an attached debuggee runs on, an AMDP debug session ends, and the user's breakpoints stay set until stopListener removes them; the debug state and its handle end with it, and a new debug state of either kind and any identity opens after it. The answer carries state_handle while the debug state holds something, and for abap the identity in force.",
  inputSchema: {
    type: 'object',
    properties: {
      ...openingStateHandleProperty(
        'abap checkListener, listen, stopListener and attach, and amdp start,',
      ),
      ...KIND_PROPERTY,
      operation: {
        type: 'string',
        enum: [
          ...ABAP_OPERATIONS,
          'start',
          'getEvents',
          'stop',
          'deleteDebuggee',
          END,
        ],
        description:
          'The one request: abap checkListener, listen, stopListener, attach, detachDebugger, terminateDebuggee, terminateDebugger or setDebuggerSettings; amdp start, getEvents, stop or deleteDebuggee. end, for either kind, logs off the debug state.',
      },
      hold_seconds: {
        type: 'integer',
        minimum: 0,
        description:
          'abap listen: how long SAP holds the listen, in seconds; SAP answers at a catch or when the hold ends.',
      },
      take_over: {
        type: 'boolean',
        description:
          'abap listen: true displaces another debugger listening for the same user; false, or omitted, answers its 409. amdp start: true ends an AMDP session of this user left behind.',
      },
      debuggee_id: {
        type: 'string',
        description:
          'abap attach: the debuggee_id listen answered. amdp deleteDebuggee: the debuggee id of a break event.',
      },
      server: {
        type: 'string',
        description:
          "abap attach: the debuggee's application server, as listen answered it.",
      },
      settings: {
        type: 'object',
        description:
          'abap setDebuggerSettings: the settings sent; a field left out keeps its value.',
        properties: SETTINGS_FIELDS,
      },
      ...IDENTITY_PROPERTIES,
      ...DETAIL_PROPERTY,
    },
    required: ['kind', 'operation'],
  },
} as const;

type Args = ArgsOf<typeof TOOL_DEFINITION.inputSchema>;

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
