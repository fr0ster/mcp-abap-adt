import type { McpResult } from '../../answer';
import {
  type DebuggerInstance,
  type DebugView,
  debugAnswer,
  type OnceIdentity,
  requireDebugger,
} from '../../debugger/index';
import type { HandlerContext } from '../../handlers/index';

/**
 * The compact debugger: four tools, each covering ABAP and AMDP; every call is
 * one `AbapDebugger` / `AmdpDebugger` request, chosen by its `operation`.
 */
export type DebugKind = 'abap' | 'amdp';

export const KIND_PROPERTY = {
  kind: {
    type: 'string',
    enum: ['abap', 'amdp'],
    description:
      'abap works with the ABAP debugger; amdp with the AMDP debugger of SQLScript methods.',
  },
} as const;

/** The handle on a tool some of whose operations open the debug state: `opening` names them. */
export function openingStateHandleProperty<const W extends string>(opening: W) {
  return {
    state_handle: {
      type: 'string',
      description:
        `The handle of this server's debug state. ${opening} open the debug state when it is omitted and answer its handle; every other operation takes it.` as `The handle of this server's debug state. ${W} open the debug state when it is omitted and answer its handle; every other operation takes it.`,
    },
  } as const;
}

export const IDENTITY_PROPERTIES = {
  request_user: {
    type: 'string',
    description:
      'abap, user mode: the SAP user whose requests the breakpoints and the listener catch; the connected SAP user when omitted. The first abap call of a debug state fixes it.',
  },
  debugging_mode: {
    type: 'string',
    enum: ['user', 'terminal'],
    description:
      "abap: user (when omitted) catches every request of the request user; terminal catches the requests that carry this debug state's terminal_id and ide_id. The first abap call of a debug state fixes it.",
  },
} as const;

/** A call of one kind is refused while the instance holds the other. */
export function refuseOtherKind(
  context: HandlerContext,
  wanted: DebugKind,
): void {
  const held = context.debugger?.();
  if (!held) return;
  const other = wanted === 'abap' ? held.amdp : held.abap;
  if (other.holdsState()) {
    throw new Error(
      `a ${wanted === 'abap' ? 'amdp' : 'abap'} debug session is already open on this server; end it first`,
    );
  }
}

/**
 * The instance's debugger for this call. `opens`: the tool may open the debug
 * state — without a handle while the instance holds none; a handle given is
 * checked as on every other call.
 */
export function debuggerFor(
  context: HandlerContext,
  args: { state_handle?: string },
  kind: DebugKind,
  opens: boolean,
): DebuggerInstance {
  let d: DebuggerInstance;
  if (args.state_handle === undefined && opens) {
    if (context.state?.holdsState())
      throw new Error(
        'state_handle: this server holds a debug state; the call takes its handle',
      );
    d = requireDebugger(context, args, { create: kind });
  } else {
    d = requireDebugger(
      context,
      { state_handle: args.state_handle ?? '' },
      'use',
    );
  }
  refuseOtherKind(context, kind);
  return d;
}

/** The identity a call states. */
export function identityOf(args: {
  request_user?: string;
  debugging_mode?: 'user' | 'terminal';
}): OnceIdentity {
  if (args.request_user !== undefined && !args.request_user.trim())
    throw new Error('request_user is empty');
  return {
    ...(args.request_user !== undefined
      ? { requestUser: args.request_user.trim() }
      : {}),
    ...(args.debugging_mode ? { debuggingMode: args.debugging_mode } : {}),
  };
}

/** The handle while the state holds something, and the ABAP identity once fixed. */
function heldExtra(context: HandlerContext): Record<string, unknown> {
  if (!context.state?.holdsState()) return {};
  const identity = context.debugger?.().abap.currentIdentity();
  return {
    state_handle: context.state.handle,
    ...(identity
      ? {
          terminal_id: identity.terminalId,
          ide_id: identity.ideId,
          debugging_mode: identity.debuggingMode,
          ...(identity.debuggingMode === 'user'
            ? { request_user: identity.requestUser }
            : {}),
        }
      : {}),
  };
}

/** A required argument of one operation, refused before any request when absent. */
export function needed<T>(value: T | undefined, what: string): T {
  if (value === undefined || (typeof value === 'string' && !value.trim()))
    throw new Error(what);
  return value;
}

/**
 * One call: the debugger chosen (and the state opened where the tool may),
 * the one request, the answer with the handle. Whatever is refused before the
 * request, or failed, is the tool error.
 */
export function onceAnswer<T>(
  context: HandlerContext,
  args: { state_handle?: string },
  kind: DebugKind,
  opens: boolean,
  work: (d: DebuggerInstance) => Promise<DebugView<T>>,
  terse: (v: T) => unknown = (v) => v,
): Promise<McpResult> {
  return debugAnswer(
    args,
    async () => work(debuggerFor(context, args, kind, opens)),
    terse,
    (v) => v,
    () => heldExtra(context),
    () => heldExtra(context),
  );
}

/** An operation the kind does not take, refused before any request. */
export function refuseOperation(
  kind: DebugKind,
  operation: string,
  takes: readonly string[],
): never {
  throw new Error(
    `operation: kind ${kind} takes ${takes.join(', ')}; ${operation} is outside them`,
  );
}
