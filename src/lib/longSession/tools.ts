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
 *   or a session already open, the same handle. On an instance whose state
 *   is ending (the idle bound's or a stop's cleanup running), `state is not
 *   available`: an ending handle is never reopened. Nothing is sent and no
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
import type { SessionHolding } from '../state/longSession';

/** Open: the long session marked open; answers `{ state_handle }`. */
export async function openLongSession(
  context: HandlerContext,
): Promise<McpResult> {
  const session = context.longSession;
  const state = context.state;
  if (session === undefined || state === undefined) {
    throw new ServerRefusal('long_session_unavailable');
  }
  // An ending state's handle is never taken up again: a new session is
  // opened without a handle and gets a new one.
  if (state.ending()) {
    return {
      isError: true,
      content: [{ type: 'text', text: STATE_UNAVAILABLE_WORDS }],
    };
  }
  session.open();
  return {
    isError: false,
    content: [
      {
        type: 'text',
        text: JSON.stringify(openedSession(state.handle)),
      },
    ],
  };
}

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
        text: JSON.stringify(closedSession(held)),
      },
    ],
  };
}

/** What an open answers: the state handle every call of the session carries. */
export function openedSession(stateHandle: string) {
  return { state_handle: stateHandle };
}

/** What a close answers: the session closed, and what the instance held. */
export function closedSession(held: SessionHolding) {
  return { closed: true, held };
}
