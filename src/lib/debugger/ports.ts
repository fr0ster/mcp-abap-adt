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
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { HandlerContext } from '../../handlers/interfaces';
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
  return connection;
}

/**
 * Closes a session's own connection. A failure goes back to the session,
 * which keeps the connection for the next stop and reports it — never
 * swallowed here.
 */
async function closeOwn(connection: IAbapConnection): Promise<void> {
  await (connection as { disconnect?: () => Promise<void> }).disconnect?.();
}

async function run(
  connection: IAbapConnection,
  target: RunTarget,
): Promise<RunOutcome> {
  const executor = new AdtExecutor(connection);
  const answer =
    target.kind === 'class'
      ? await executor
          .getClassExecutor(ourClassExecutor)
          .run({ className: target.name }, { analyse: analyseException })
      : await executor
          .getProgramExecutor(ourProgramExecutor)
          .run({ programName: target.name }, { analyse: analyseException });
  return answer.ok
    ? { ok: true, output: String(answer.getResult().value ?? '') }
    : { ok: false, message: answer.getError().message };
}

export function liveDebugPorts(): DebugSessionPorts<HandlerContext> {
  return {
    openConnection: openStateful,
    closeConnection: closeOwn,
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
