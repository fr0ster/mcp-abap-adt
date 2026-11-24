/**
 * The facts of the compact debugger's one-request operations (plan step
 * 10.4, compact descriptions): each operation's answer is the value its
 * `…Once` method reads, typed by that method — a member added there and not
 * named here does not compile. An operation whose reading has no shape here
 * yet states its function alone.
 */

import type { AmdpSession } from '../debugger/AmdpSession';
import type { DebugSession, DebugView } from '../debugger/DebugSession';
import { listOf, resultShape } from './returns';

/** The value a `…Once` method reads. */
type ViewOf<F> = F extends (...args: never[]) => Promise<DebugView<infer T>>
  ? T
  : never;

type Abap<K extends keyof DebugSession> = ViewOf<DebugSession[K]>;
type Amdp<K extends keyof AmdpSession> = ViewOf<AmdpSession[K]>;

/** What every answer of a compact debugger tool carries beside its reading. */
export type HeldDebug = {
  readonly state_handle?: string | undefined;
  readonly terminal_id?: string | undefined;
  readonly ide_id?: string | undefined;
  readonly debugging_mode?: string | undefined;
  readonly request_user?: string | undefined;
};

/** What every answer carries: the debug state's handle and the identity in force. */
export const HELD_DEBUG = resultShape<HeldDebug>({
  state_handle:
    "the debug state's handle while it holds something: send it as the state_handle argument of every call (or in the x-mcp-state-handle header)",
  terminal_id: 'the terminal id the runs carry',
  ide_id: 'the IDE id the runs carry',
  debugging_mode: 'the debugging mode',
  request_user: 'the user whose runs are caught',
});

export const NO_CONFLICT = resultShape<Abap<'checkListenerOnce'>>({
  conflict: 'that the debugging of this identity is free to take',
});

export const LISTENER_STOPPED = resultShape<Abap<'stopListenerOnce'>>({
  stopped: 'that the listener stopped',
});

export const DETACHED = resultShape<Abap<'detachOnce'>>({
  detached: 'that the debugger let the debuggee go',
});

export const DEBUGGEE_TERMINATED = resultShape<Abap<'terminateDebuggeeOnce'>>({
  terminated: 'that the debuggee ended',
});

export const DEBUGGER_FREED = resultShape<Abap<'terminateDebuggerOnce'>>({
  freed: 'that the debugger is free',
});

export const SETTINGS_SENT = resultShape<Abap<'setDebuggerSettingsOnce'>>({
  systemDebugging: 'whether system programs are debugged',
  updateDebugging: 'whether update tasks are debugged',
  createExceptionObject: 'whether exception objects are created',
  backgroundRFC: 'whether background RFC is debugged',
  sharedObjectDebugging: 'whether shared objects are debugged',
});

export const STACK_POSITION = resultShape<Abap<'setStackPositionOnce'>>({
  position: 'the frame selected',
});

export const BREAKPOINT_DELETED = resultShape<Abap<'deleteBreakpointOnce'>>({
  deleted: 'the id deleted',
});

/** What an AMDP command answers: the id of the request SAP confirms by an event. */
export const AMDP_COMMAND = resultShape<Amdp<'stopOnce'>>({
  requestId: 'the id SAP confirms it by in an event',
});

export const AMDP_BREAKPOINTS_SENT = resultShape<Amdp<'syncBreakpointsOnce'>>({
  requestId: 'the id SAP confirms them by in an event',
  breakpoints: listOf('for each breakpoint sent', {
    clientId: 'its tag',
    uri: 'its source position',
  }),
});

export const DEBUG_ENDED = resultShape<Abap<'endOnce'>>({
  ended: 'that the debug state ended',
  logoffs: 'how many connections were logged off',
});
