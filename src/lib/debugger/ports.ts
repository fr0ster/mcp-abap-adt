/**
 * The live ports of the debug sessions: connections of their own, the
 * debugger clients, the request user and a run in the background.
 */
import {
  AbapDebugger,
  AdtExecutor,
  AmdpDebugger,
  type IDebuggerListenerConflict,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IDebuggeeIds } from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../handlers/interfaces';
import { ServerRefusal } from '../auth/serverRefusal';
import { endConnection, own } from '../ownedConnections';
import { openFreshConnection } from '../packageSessions';
import { getRequestContext } from '../requestContext';
import { statedResponsibleOf } from '../requestSystemResolution';
import { ourClassExecutor, ourProgramExecutor } from '../strategies/resultSets';
import type { AmdpSessionPorts } from './AmdpSession';
import type { DebugSessionPorts, RunOutcome, RunTarget } from './DebugSession';

/**
 * The user whose requests are caught: the responsible the call reads — the
 * connection's parameters where a host's rules made them (the system's
 * user, else on-premise the stated responsible, else the login), else the
 * stated responsible (`x-sap-responsible`, `SAP_RESPONSIBLE`) — else the
 * login the request scope states (never the process's environment); upper
 * case. None is the call's `system_user_unknown`. Sends nothing.
 */
export function requestUserOf(): string {
  const user = statedResponsibleOf() || getRequestContext()?.login;
  if (!user?.trim()) throw new ServerRefusal('system_user_unknown');
  return user.trim().toUpperCase();
}

/**
 * A debugger connection of its own: stateful — every request on it in the
 * one ABAP session its first stateful request opened — unless `session` is
 * `stateless` (a run).
 */
async function openStateful(
  context: HandlerContext,
  session: 'stateful' | 'stateless' = 'stateful',
): Promise<IAbapConnection> {
  const connection = await openFreshConnection(
    context.connection,
    context.logger,
  );
  if (session === 'stateful')
    (
      connection as { setSessionType?: (t: 'stateful' | 'stateless') => void }
    ).setSessionType?.('stateful');
  // Held state's own: closed at its stop, the idle bound's stop, the host's
  // stop and the instance's terminal close, whichever comes first.
  own(connection, { role: 'state' });
  // Its session is kept in a runtime file (role debugger) until its logoff
  // is written, for the identity the call's connection was built for.
  context.sessionFiles?.trackSibling(
    connection,
    'debugger',
    context.connection,
  );
  return connection;
}

/** The fixed words a session's close failure is reported back in. */
export const LOGOFF_NOT_WRITTEN = 'its logoff could not be written';

/**
 * Closes a session's own connection: its one `disconnect()` — the logoff —,
 * joined if the instance's terminal close already asked for it. A failure
 * goes back to the session in fixed words, which reports it and keeps the
 * connection for the next stop; that retry joins the ended close (connection
 * 16 refuses a second `disconnect()`), so nothing is sent twice.
 */
async function closeOwn(connection: IAbapConnection): Promise<void> {
  let failed = false;
  await endConnection(connection, () => {
    failed = true;
  });
  if (failed) throw new Error(LOGOFF_NOT_WRITTEN);
}

/**
 * Runs the target in the background. With `debuggee` the run carries those
 * ids, so the terminal-mode listener under them catches it; without them only
 * a user-mode listener does.
 */
async function run(
  connection: IAbapConnection,
  target: RunTarget,
  debuggee?: IDebuggeeIds,
): Promise<RunOutcome> {
  const options = {
    analyse: analyseException,
    ...(debuggee ? { debuggee } : {}),
  };
  // A program's run is on premise only: only that table lists `run` for
  // `PROG/P`, so its executor is the on-premise one; the request is the one
  // sent before.
  const answer =
    target.kind === 'class'
      ? await new AdtExecutor(connection)
          .getClassExecutor(ourClassExecutor)
          .run({ className: target.name }, options)
      : await new AdtExecutor<'onprem'>(connection)
          .getProgramExecutor(ourProgramExecutor)
          .run({ programName: target.name }, options);
  return answer.ok
    ? { ok: true, output: String(answer.getResult().value ?? '') }
    : { ok: false, message: answer.getError().message };
}

export function liveDebugPorts(): DebugSessionPorts<HandlerContext> {
  return {
    openConnection: openStateful,
    closeConnection: closeOwn,
    // The system freed this ABAP session itself (terminateDebugger); its HTTP
    // security session is still the server's, so it ends like every owned
    // connection: its one `disconnect()` (connection 16 sends the logoff only
    // while it holds a live session, and without the ended ABAP context).
    dropConnection: (connection) => {
      void endConnection(connection);
    },
    abapDebugger: (c, onConflict: IDebuggerListenerConflict) =>
      AbapDebugger.create(c, { onConflict }),
    requestUser: async () => requestUserOf(),
    run,
  };
}

export function liveAmdpPorts(): AmdpSessionPorts<HandlerContext> {
  return {
    openConnection: openStateful,
    closeConnection: closeOwn,
    amdpDebugger: (c) => AmdpDebugger.create(c),
    requestUser: async () => requestUserOf(),
    run,
  };
}
