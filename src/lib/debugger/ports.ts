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
import { endConnection, own } from '../ownedConnections';
import { openFreshConnection } from '../packageSessions';
import { getRequestContext } from '../requestContext';
import {
  SystemUserUnknownError,
  systemLookupRefusal,
} from '../requestSystemResolution';
import { ourClassExecutor, ourProgramExecutor } from '../strategies/resultSets';
import { systemUserOf } from '../systemUser';
import type { AmdpSessionPorts } from './AmdpSession';
import type { DebugSessionPorts, RunOutcome, RunTarget } from './DebugSession';

/**
 * The user whose requests are caught: what `systeminformation` names, on
 * every kind of system, over any configured login. When the system gives no
 * information: on ABAP Cloud the call's error (a `404`
 * `cloud_without_systeminformation`, any other `system_lookup_failed`);
 * on-premise the login — the request scope's before the process's, never
 * the responsible — stands in, and with none stated the call's
 * `system_user_unknown`. A credential failure goes through to the caller as
 * it came. The kind is the connection's (`systemType`: the server's stated
 * one, for a connection the factory did not build).
 */
export async function requestUserOf(
  connection: IAbapConnection,
  systemType?: string,
): Promise<string> {
  let named: string | undefined;
  try {
    named = await systemUserOf(connection, systemType);
  } catch (error) {
    throw systemLookupRefusal(error, undefined);
  }
  const user = named || getRequestContext()?.login || process.env.SAP_USERNAME;
  if (!user?.trim()) {
    throw systemLookupRefusal(new SystemUserUnknownError(), undefined);
  }
  return user.trim().toUpperCase();
}

/**
 * The request user's lookup goes on the instance's connection, so it takes
 * its turn in the instance's main flow (`onMainConnection`).
 */
function onMain<T>(
  context: HandlerContext,
  send: (connection: IAbapConnection) => Promise<T>,
): Promise<T> {
  return context.onMainConnection
    ? context.onMainConnection(send)
    : send(context.connection);
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
    requestUser: (context) =>
      onMain(context, (connection) =>
        requestUserOf(connection, context.systemType),
      ),
    run,
  };
}

export function liveAmdpPorts(): AmdpSessionPorts<HandlerContext> {
  return {
    openConnection: openStateful,
    closeConnection: closeOwn,
    amdpDebugger: (c) => new AmdpDebugger(c),
    requestUser: (context) =>
      onMain(context, (connection) =>
        requestUserOf(connection, context.systemType),
      ),
    run,
  };
}
