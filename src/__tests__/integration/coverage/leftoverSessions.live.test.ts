/**
 * Leftover sessions, live, on both systems: the full set's
 * `ListLeftoverSessions` and `LogoffLeftoverSession` and the compact set's
 * `HandlerLeftoverSessionList` and `HandlerLeftoverSessionLogoff`, through
 * the server's own dispatch.
 *
 * **Where the calls go.** The leftover tools are stdio's: a server that
 * serves a destination it builds its connections for (`kind: 'built'`),
 * with an owner of runtime files (`LeftoverSessions`) in a directory of the
 * suite's own (a temporary one, removed after). The suite runs such a server
 * in process, on the configured destination's settings and credential, and
 * installs it as the runner of its cases (`useLiveRunner`); it is reached
 * over an in-memory MCP transport (`McpSession`, no request timer).
 *
 * **Whose session.** Each case leaves a session of its own: it logs a
 * connection of the configured destination on, as the configured user, and
 * records it in that directory as a process that has ended would have
 * (`LeftoverSessions.track` under a process probe that sees the writer dead),
 * so the server lists it as left over. The case lists it, logs it off by its
 * handle — the only session it logs off — and lists again: it is gone. Every
 * session the suite opened is logged off after, whatever happened.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, it } from 'node:test';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { compactToolSet } from '../../../../compact/src/launcher';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import {
  LeftoverSessions,
  sessionIdentity,
} from '../../../lib/leftoverSessions/LeftoverSessions';
import { defaultSystemContextResolver } from '../../../lib/requestSystemResolution';
import { fullToolSet } from '../../../lib/toolSet';
import { fakeProbe, runtimeFiles } from '../../helpers/leftoverSession';
import type { SystemKind } from '../../helpers/servedTools';
import { getTestDestination } from '../helpers/authHelpers';
import { configuredSystemKind } from '../helpers/configHelpers';
import {
  type LiveAnswer,
  type LiveRunner,
  liveCall,
  livePrepare,
  liveSuite,
  useLiveRunner,
} from '../helpers/live';
import { endTestConnection, trackConnection } from '../helpers/openConnections';
import { guardedTestConnection } from '../helpers/refusalGuard';
import { McpSession } from '../helpers/testers/hardMode';
import { member, payloadOf, succeeded } from './ownObjects';

/** The server's process, as its probe sees it; the left sessions' writer is dead. */
const SERVER_PID = 222;
const WRITER_PID = 111;

const silent = { info() {}, debug() {}, warn() {}, error() {} };

class LeftoverServer extends BaseMcpServer {
  serve(
    destination: string,
    resolved: Awaited<ReturnType<typeof getTestDestination>>,
  ): void {
    if (resolved === null) throw new Error('no destination');
    this.setConnectionContext({
      kind: 'built',
      source: {
        resolve: async () => ({
          settings: resolved.settings,
          credential: resolved.credential,
        }),
      },
      sessionId: 'live-leftover-sessions',
      destination,
    });
  }
  register(): void {
    const context = noConnectionContext();
    this.registerHandlers(
      new CompositeHandlersRegistry([
        ...fullToolSet.groups(context, 'stdio', { dataTools: false }),
        ...compactToolSet.groups(context, 'stdio', { dataTools: false }),
      ]),
    );
  }
}

/** What the suite holds beside its runner. */
interface Held {
  /** Leaves a session of the configured user behind; answers its handle. */
  leave(): Promise<string>;
}

let held: Held | undefined;

function current(): Held {
  if (held === undefined) throw new Error('no leftover server');
  return held;
}

/** The configured system, inside a `liveSuite` that runs on it. */
function configuredSystem(): SystemKind {
  const kind = configuredSystemKind();
  if (kind !== 'onprem' && kind !== 'cloud') {
    throw new Error(`no system this suite runs on is configured: ${kind}`);
  }
  return kind;
}

/** The handles a list answered. */
function handlesOf(answer: LiveAnswer): string[] {
  const sessions = member(payloadOf(answer), 'sessions');
  if (!Array.isArray(sessions)) throw new Error(`no sessions: ${answer.text}`);
  return sessions.map((session) => String(member(session, 'handle')));
}

liveSuite(['onprem', 'cloud'], 'Leftover sessions', () => {
  let runner: LiveRunner | undefined;
  const opened: IAbapConnection[] = [];
  let dir = '';
  let statedType: string | undefined;

  before(async () => {
    const system = configuredSystem();
    // A stdio process states its system type (the launcher's
    // SAP_SYSTEM_TYPE): a runtime file's identity names it.
    statedType = process.env.SAP_SYSTEM_TYPE;
    process.env.SAP_SYSTEM_TYPE = system;
    const destination = await getTestDestination();
    if (destination === null) {
      throw new Error('the test config names no destination');
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-leftover-'));
    const runtime = path.join(dir, 'runtime');
    const open = () =>
      guardedTestConnection(destination.settings, destination.credential, {
        kind: system,
      });
    const own = trackConnection(open());
    await own.connect();
    opened.push(own);

    const server = new LeftoverServer({
      name: 'live-leftover-sessions',
      logger: silent,
      systemType: system,
      systemContextResolver: defaultSystemContextResolver,
      leftoverSessions: new LeftoverSessions({
        directory: runtime,
        probe: fakeProbe(SERVER_PID),
        report: () => {},
      }),
    });
    server.serve(destination.destination, destination);
    server.register();
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new McpSession(clientSide);
    await server.connect(serverSide);
    await client.initialize();

    // The writer of the sessions a case leaves: a process the server's probe
    // sees ended.
    const writer = new LeftoverSessions({
      directory: runtime,
      probe: fakeProbe(WRITER_PID),
      report: () => {},
    });
    const identity = sessionIdentity(
      destination.destination,
      destination.settings,
    );
    if (identity === undefined) {
      throw new Error('the destination keeps no runtime file (RFC)');
    }
    held = {
      leave: async () => {
        const known = new Set(runtimeFiles(runtime));
        const left = trackConnection(open());
        await left.connect();
        opened.push(left);
        writer.track(left, 'built', identity);
        const handle = runtimeFiles(runtime).find((file) => !known.has(file));
        if (handle === undefined) throw new Error('no runtime file written');
        return handle;
      },
    };
    runner = {
      system,
      user: destination.settings.username ?? '',
      connection: () => own,
      call: async (tool, args) => {
        const result = await client.callTool(tool, args);
        const content = result.content.map((item) => ({
          type: 'text' as const,
          text: item.text,
        }));
        return {
          isError: result.isError === true,
          content,
          text: content.map((item) => item.text).join('\n'),
        };
      },
      close: async () => {
        await client.close();
        await server.terminalClose();
      },
    };
    useLiveRunner(runner);
  });

  after(async () => {
    useLiveRunner(undefined);
    held = undefined;
    if (runner !== undefined) await runner.close();
    // Every session the suite opened, logged off: one the case logged off
    // already answers nothing more.
    for (const connection of opened) await endTestConnection(connection);
    if (dir !== '') fs.rmSync(dir, { recursive: true, force: true });
    if (statedType === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = statedType;
  });

  it('ListLeftoverSessions lists a session left behind, LogoffLeftoverSession logs it off', async () => {
    const handle = await current().leave();
    const listed = await liveCall('ListLeftoverSessions', {});
    succeeded('ListLeftoverSessions', listed);
    assert.ok(handlesOf(listed).includes(handle));
    const loggedOff = await liveCall('LogoffLeftoverSession', { handle });
    succeeded('LogoffLeftoverSession', loggedOff);
    const after = succeeded(
      'ListLeftoverSessions after the logoff',
      await livePrepare('ListLeftoverSessions', {}),
    );
    assert.equal(handlesOf(after).includes(handle), false);
  });

  it('HandlerLeftoverSessionList lists a session left behind, HandlerLeftoverSessionLogoff logs it off', async () => {
    const handle = await current().leave();
    const listed = await liveCall('HandlerLeftoverSessionList', {});
    succeeded('HandlerLeftoverSessionList', listed);
    assert.ok(handlesOf(listed).includes(handle));
    const loggedOff = await liveCall('HandlerLeftoverSessionLogoff', {
      handle,
    });
    succeeded('HandlerLeftoverSessionLogoff', loggedOff);
    const after = succeeded(
      'HandlerLeftoverSessionList after the logoff',
      await livePrepare('HandlerLeftoverSessionList', {}),
    );
    assert.equal(handlesOf(after).includes(handle), false);
  });
});
