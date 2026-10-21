/**
 * The last step of an in-process debugger case's cleanup: the logoff of
 * every connection the server opened during the case — what a host's
 * terminal close does for an instance it lets go (`closeOwnedConnections`).
 * The case snapshots the server's owned connections when it begins
 * (`ownedNow`); after its stop and its instance's shutdown, each step in its
 * own `finally`, `logOffLeft` ends every connection owned since that is
 * still open and names how many there were: a stop and a shutdown that
 * did their work leave none, so any is a problem of the case.
 */
import {
  endConnection,
  logoffsAnswered,
  ownedConnections,
} from '../../../lib/ownedConnections';

/** The server's owned connections now. */
export function ownedNow(): Set<object> {
  return new Set(ownedConnections());
}

/**
 * Logs off every connection owned since `before` and still open; answers
 * the problem when there was any.
 */
export async function logOffLeft(
  before: ReadonlySet<object>,
  what: string,
): Promise<string[]> {
  const left = ownedConnections().filter((c) => !before.has(c));
  await Promise.all(left.map((c) => endConnection(c)));
  // Each logoff finished — answered, or its transport failed — before the
  // file can end: SAP ends a session only once it received the logoff whole.
  await logoffsAnswered();
  return left.length > 0
    ? [
        `${what}: ${left.length} connection(s) the server opened were still open after the stop and the instance's shutdown; logged off now`,
      ]
    : [];
}
