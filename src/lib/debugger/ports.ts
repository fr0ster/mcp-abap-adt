/**
 * The live ports of the debug sessions: connections of their own, the
 * debugger clients, the request user and a run in the background.
 */
import {
  AbapDebugger,
  AdtExecutor,
  AmdpDebugger,
  getSystemInformation,
  type IDebuggerListenerConflict,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IDebuggeeIds } from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../handlers/interfaces';
import { endConnection, own } from '../ownedConnections';
import { openFreshConnection } from '../packageSessions';
import { getRequestContext } from '../requestContext';
import { ourClassExecutor, ourProgramExecutor } from '../strategies/resultSets';
import type { AmdpSessionPorts } from './AmdpSession';
import type { DebugSessionPorts, RunOutcome, RunTarget } from './DebugSession';

/**
 * The user whose requests are caught: what the system says, else the login —
 * the request scope's before the process's — never the responsible.
 * `getSystemInformation` answers null only when the endpoint is absent; any
 * other failure (authentication, network) goes through to the caller.
 */
export async function requestUserOf(
  connection: IAbapConnection,
): Promise<string> {
  const info = await getSystemInformation(connection);
  const user =
    info?.userName || getRequestContext()?.login || process.env.SAP_USERNAME;
  if (!user?.trim()) {
    throw new Error(
      'the ABAP user of this connection is unknown: the system names none and no login is configured',
    );
  }
  return user.trim().toUpperCase();
}

async function openStateful(context: HandlerContext): Promise<IAbapConnection> {
  const connection = await openFreshConnection(
    context.connection,
    context.logger,
  );
  (
    connection as { setSessionType?: (t: 'stateful' | 'stateless') => void }
  ).setSessionType?.('stateful');
  // Held state's own: closed at its stop, the idle bound's stop, the host's
  // stop and the instance's terminal close, whichever comes first (§6.4).
  own(connection, { role: 'state' });
  return connection;
}

/**
 * Closes a session's own connection: its one `disconnect()` — the logoff —,
 * joined if the instance's terminal close already asked for it. connection
 * 16 refuses a second `disconnect()`, so a failure is not retried: it is
 * logged in fixed words.
 */
async function closeOwn(connection: IAbapConnection): Promise<void> {
  await endConnection(connection);
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
  const executor = new AdtExecutor(connection);
  const options = {
    analyse: analyseException,
    ...(debuggee ? { debuggee } : {}),
  };
  const answer =
    target.kind === 'class'
      ? await executor
          .getClassExecutor(ourClassExecutor)
          .run({ className: target.name }, options)
      : await executor
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
      new AbapDebugger(c, undefined, undefined, { onConflict }),
    requestUser: (context) => requestUserOf(context.connection),
    run,
  };
}

export function liveAmdpPorts(): AmdpSessionPorts<HandlerContext> {
  return {
    openConnection: openStateful,
    closeConnection: closeOwn,
    amdpDebugger: (c) => new AmdpDebugger(c),
    requestUser: (context) => requestUserOf(context.connection),
    run,
  };
}
