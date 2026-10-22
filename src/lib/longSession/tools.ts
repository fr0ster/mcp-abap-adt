/**
 * What the session tools do (#308, spec §2), shared by the full sets'
 * `SessionOpen` and the compact sets' `HandlerSession`: each reaches the
 * instance's long session through its call's context (`longSession`), and
 * without one answers `long_session_unavailable`. Served only on the
 * Streamable HTTP binaries, whose host gives every instance its part.
 *
 * - open: marks the instance's long session open — the instance then holds
 *   state, so the pool keeps it — and answers the instance's state handle.
 *   On an instance that already holds state (the call carried its handle),
 *   or a session already open, the same handle. Nothing is sent and no
 *   connection taken.
 * - close: on the instance the call's handle reached, asks for its close and
 *   answers that the session is closed, naming what the instance held (its
 *   locks, a batch, a debug session). The close itself is the host's, once
 *   this answer is written: the pool takes the instance out of its index and
 *   runs the instance close (`closeInstance`) — every connection it owns
 *   logged off, which releases the locks; an open batch dropped with
 *   nothing sent. A call that reached an instance holding nothing (no
 *   handle) answers `state is not available`, as the pool answers an
 *   unknown handle.
 */
import type { HandlerContext } from '../../handlers/interfaces';
import type { McpResult } from '../answer';
import { ServerRefusal } from '../auth/serverRefusal';
import { STATE_UNAVAILABLE_WORDS } from '../state/InstanceState';

/**
 * The sentences of open, shared by `SessionOpen` and `HandlerSession`'s
 * `action: 'open'`.
 */
export const OPEN_SESSION_WORDS =
  "Opens a long session on this server: the server instance and its SAP connection are kept for every call that carries the session's state_handle, until the session is closed or the server's idle bound passes between two calls. Answers the state_handle: send it as the state_handle argument of every call of the session (or in the x-mcp-state-handle header). Called with the state_handle of an instance that already holds state, or of an open session, answers that same state_handle and keeps what the instance holds. In batch mode it runs at once and the batch stays open.";

/** Open: the long session marked open; answers `{ state_handle }`. */
export async function openLongSession(
  context: HandlerContext,
): Promise<McpResult> {
  const session = context.longSession;
  const state = context.state;
  if (session === undefined || state === undefined) {
    throw new ServerRefusal('long_session_unavailable');
  }
  session.open();
  return {
    isError: false,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ state_handle: state.handle }, null, 2),
      },
    ],
  };
}

/**
 * The sentences of close, shared by `SessionClose` and `HandlerSession`'s
 * `action: 'close'`.
 */
export const CLOSE_SESSION_WORDS =
  'Closes the long session the state_handle names: once this answer is written the server instance is closed — every SAP session it holds is logged off, which releases the locks taken in it; an open batch and its recorded calls are dropped unsent — and the state_handle ends: a later call carrying it gets the unavailable-state answer. Answers that the session is closed and what it held: its locks, a batch, a debug session. Called with an unknown state_handle, or on a new instance, it gets the unavailable-state answer. In batch mode it runs at once and drops the batch.';

/** Close: the instance's close asked; answers `{ closed, held }`. */
export async function closeLongSession(
  context: HandlerContext,
): Promise<McpResult> {
  const session = context.longSession;
  const state = context.state;
  if (session === undefined || state === undefined) {
    throw new ServerRefusal('long_session_unavailable');
  }
  // A call without a handle reached a new instance: nothing to close.
  if (!state.holdsState()) {
    return {
      isError: true,
      content: [{ type: 'text', text: STATE_UNAVAILABLE_WORDS }],
    };
  }
  const held = session.close();
  return {
    isError: false,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ closed: true, held }, null, 2),
      },
    ],
  };
}
