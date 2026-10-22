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
 */
import type { HandlerContext } from '../../handlers/interfaces';
import type { McpResult } from '../answer';
import { ServerRefusal } from '../auth/serverRefusal';

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
