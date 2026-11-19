/**
 * A cancel does nothing to SAP: a tool call cannot be
 * cancelled. A client's MCP cancel of a call whose tool already started —
 * its `LOCK` on the wire — aborts nothing: the tool runs to its end (the
 * update and the `UNLOCK` are sent), its handler runs exactly once and
 * answers; the stand-in sees no logoff and no new session, and the next
 * call runs in the same ABAP session. A queued call's cancel aborts nothing
 * either: it keeps its place and runs after the call ahead.
 *
 * Over stdio (core), SSE and an embedder (the host's connection), each on
 * the ADT stand-in with the shutdown tools' `LockedUpdate` (`LOCK`, `PUT`,
 * `UNLOCK` on the call's connection). Over Streamable HTTP a client's
 * "cancel" is its dropped request: on a pooled instance holding state, the
 * dropped call's tool runs to its end with no logoff, and the handle still
 * reaches the instance and its state. Each HTTP request builds its connection
 * from its own headers, so the next request's tool runs on a
 * connection of its own.
 */

import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import express from 'express';
import { StreamableHttpServer } from '../../../../server-runtime/src/http/StreamableHttpServer';
import { SseServer } from '../../../../server-runtime/src/sse/SseServer';
import { StdioServer } from '../../../../server-runtime/src/stdio/StdioServer';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import type { IHttpApplication } from '../../../embeddable/IHttpApplication';
import { activeTools } from '../../../lib/activeTools';
import { createAbapConnection } from '../../../lib/connectionFactory';
import type { HandlerEntry } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  type AdtStandIn,
  adtStandIn,
  isLogoff,
  probeGroup,
} from '../../helpers/adtStandIn';
import { assertMatchObject } from '../../helpers/assertions';
import {
  isLockOf,
  isUnlockOf,
  isUpdateOf,
  listenUrl,
  shutdownTools,
} from '../../helpers/shutdownTools';
import { toolAnswer } from '../../helpers/toolAnswer';

async function until(done: () => boolean, limitMs = 10_000): Promise<void> {
  const end = Date.now() + limitMs;
  while (!done()) {
    if (Date.now() > end) throw new Error('the condition never held');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

const turns = async (n = 20) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

/** A real short wait: long enough for a cancel to reach the server. */
const pause = () => new Promise((resolve) => setTimeout(resolve, 150));

/** Each `LockedUpdate` run, by id, and what it answered. */
interface Runs {
  started: string[];
  answered: Array<{ id: string; text: string; isError: boolean }>;
}

/** The shutdown tools beside the probe, `LockedUpdate` counted. */
function countedRegistry(runs: Runs): CompositeHandlersRegistry {
  const tools = shutdownTools().map((entry): HandlerEntry => {
    if (entry.toolDefinition.name !== 'LockedUpdate') return entry;
    const inner = entry.call;
    return {
      ...entry,
      call: async (context, args) => {
        const id = String(args.id);
        runs.started.push(id);
        const result = toolAnswer(await inner(context, args));
        runs.answered.push({
          id,
          text: result.content[0]?.text ?? '',
          isError: result.isError === true,
        });
        return result;
      },
    };
  });
  return new CompositeHandlersRegistry([probeGroup(tools)]);
}

/** What a server under test offers the scenario. */
interface Served {
  /** Calls `LockedUpdate { id }`; `cancel()` sends the client's MCP cancel. */
  call(id: string): { cancel(): void; done: Promise<unknown> };
  close(): Promise<void>;
}

let standIn: AdtStandIn;
let previousType: string | undefined;

beforeEach(async () => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  standIn = await adtStandIn();
  mock.method(process.stderr, 'write', () => true);
  mock.method(console, 'error', () => {});
});

afterEach(async () => {
  mock.restoreAll();
  await standIn.close();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

const settings = () => ({
  url: standIn.url,
  client: '100',
  authType: 'basic' as const,
});

const basicHeaders = () => ({
  'x-sap-url': standIn.url,
  'x-sap-client': '100',
  'x-sap-login': 'CANCEL_USER',
  'x-sap-password': 'cancel-password',
});

/** An MCP client's call of `LockedUpdate`, cancelled by its own signal. */
function clientCall(client: Client, id: string) {
  const controller = new AbortController();
  const done = client
    .callTool({ name: 'LockedUpdate', arguments: { id } }, undefined, {
      signal: controller.signal,
      timeout: 60_000,
    })
    .catch(() => 'the client stopped waiting');
  return { cancel: () => controller.abort('the user cancelled'), done };
}

async function inMemory(
  connect: (t: InMemoryTransport) => Promise<void>,
): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'cancel-nothing', version: '1.0.0' });
  await Promise.all([connect(serverSide), client.connect(clientSide)]);
  return client;
}

async function listen(app: express.Express): Promise<Server> {
  return new Promise<Server>((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
}

const SERVERS: Record<string, (runs: Runs) => Promise<Served>> = {
  core: async (runs) => {
    // stdio's provider is the same for the process's life.
    const provider = new BasicAuthProvider('CANCEL_USER', 'cancel-password');
    const server = new StdioServer(countedRegistry(runs), {
      settingsFor: async () => settings(),
      getProvider: async () => provider,
    });
    const client = await inMemory((t) => server.start('dest', t));
    return {
      call: (id) => clientCall(client, id),
      close: () => client.close(),
    };
  },

  sse: async (runs) => {
    const sse = new SseServer(countedRegistry(runs), {});
    const app = express();
    app.use(express.json());
    sse.registerRoutes(app as unknown as IHttpApplication);
    const http = await listen(app);
    const client = new Client({ name: 'cancel-nothing', version: '1.0.0' });
    await client.connect(
      new SSEClientTransport(
        new URL(`http://127.0.0.1:${(http.address() as AddressInfo).port}/sse`),
        { requestInit: { headers: basicHeaders() } },
      ),
    );
    return {
      call: (id) => clientCall(client, id),
      close: async () => {
        await client.close();
        await sse.stop().catch(() => undefined);
        await closeServer(http);
      },
    };
  },

  embedded: async (runs) => {
    const connection = createAbapConnection(
      settings(),
      new BasicAuthProvider('CANCEL_USER', 'cancel-password'),
    );
    // A consumer's connection comes connected.
    await connection.connect();
    const server = new EmbeddableMcpServer({
      connection,
      handlersRegistry: countedRegistry(runs),
      systemType: 'onprem',
      systemContextResolver: null,
      systemContext: { responsible: 'DEVELOPER', masterSystem: 'DEV' },
    });
    const client = await inMemory((t) => server.connect(t));
    return {
      call: (id) => clientCall(client, id),
      close: async () => {
        await client.close();
        await (connection as unknown as { disconnect(): Promise<void> })
          .disconnect()
          .catch(() => undefined);
      },
    };
  },
};

const count = (match: (url: string) => boolean) =>
  standIn.requests.filter((r) => match(r.url)).length;
const indexOf = (match: (url: string) => boolean) =>
  standIn.requests.findIndex((r) => match(r.url));

for (const name of Object.keys(SERVERS)) {
  describe(format('%s', name), () => {
    it('a call cancelled after its tool started runs to its end, once: no logoff, no new session, and the next call runs in the same session', async () => {
      const runs: Runs = { started: [], answered: [] };
      const served = await SERVERS[name](runs);
      try {
        const held = standIn.hold((r) => isLockOf('C1')(r.url));
        const call = served.call('C1');
        await held.arrived;
        call.cancel();
        assert.equal(await call.done, 'the client stopped waiting');
        await pause();
        // A live call, its signal not aborted; nothing logged off under it.
        assert.deepStrictEqual(
          activeTools().map((t) => t.name),
          ['LockedUpdate'],
        );
        assert.equal(activeTools()[0]?.signal.aborted, false);
        assert.equal(standIn.logoffs(), 0);

        held.release();
        await until(() => count(isUnlockOf('C1')) === 1);
        await until(() => activeTools().length === 0);
        await turns();
        // The rest of the tool was sent, in order, and the handler ran once.
        assert.equal(count(isLockOf('C1')), 1);
        assert.equal(count(isUpdateOf('C1')), 1);
        assert.ok(indexOf(isUpdateOf('C1')) > indexOf(isLockOf('C1')));
        assert.ok(indexOf(isUnlockOf('C1')) > indexOf(isUpdateOf('C1')));
        assert.deepStrictEqual(runs.started, ['C1']);
        assert.deepStrictEqual(runs.answered, [
          { id: 'C1', text: 'C1', isError: false },
        ]);
        assert.equal(standIn.logoffs(), 0);

        // The next call: on the same connection, in the same ABAP session.
        const next = served.call('N1');
        assertMatchObject(await next.done, {
          content: [{ type: 'text', text: 'N1' }],
        });
        assert.equal(count(isUnlockOf('N1')), 1);
        assert.equal(standIn.logoffs(), 0);
        assert.deepStrictEqual(
          new Set(standIn.requests.map((r) => r.session)),
          new Set([standIn.requests[0]?.session]),
        );
      } finally {
        await served.close();
      }
    });

    it('a queued call cancelled keeps its place and runs after the call ahead, once', async () => {
      const runs: Runs = { started: [], answered: [] };
      const served = await SERVERS[name](runs);
      try {
        const held = standIn.hold((r) => isUpdateOf('Q1')(r.url));
        const first = served.call('Q1');
        await held.arrived;
        const queued = served.call('Q2');
        await until(() => activeTools().length === 2);
        queued.cancel();
        assert.equal(await queued.done, 'the client stopped waiting');
        await pause();
        // Still queued: two live calls, none aborted, nothing of Q2 sent.
        assert.equal(activeTools().length, 2);
        assert.equal(
          activeTools().every((t) => !t.signal.aborted),
          true,
        );
        assert.equal(count(isLockOf('Q2')), 0);

        held.release();
        await first.done;
        await until(() => count(isUnlockOf('Q2')) === 1);
        await until(() => activeTools().length === 0);
        await turns();
        assert.ok(indexOf(isLockOf('Q2')) > indexOf(isUnlockOf('Q1')));
        assert.equal(count(isLockOf('Q2')), 1);
        assert.equal(count(isUpdateOf('Q2')), 1);
        assert.deepStrictEqual(runs.started, ['Q1', 'Q2']);
        assert.deepStrictEqual(
          runs.answered.map((a) => [a.id, a.isError]),
          [
            ['Q1', false],
            ['Q2', false],
          ],
        );
        assert.equal(standIn.logoffs(), 0);
      } finally {
        await served.close();
      }
    });
  });
}

describe('http, a pooled instance', () => {
  it('a dropped call whose tool started runs to its end, once, with no logoff; the handle still reaches the instance and its state', async () => {
    const runs: Runs = { started: [], answered: [] };
    const mcp = new StreamableHttpServer(countedRegistry(runs), {});
    const app = express();
    app.use(express.json());
    mcp.registerRoutes(app as unknown as IHttpApplication);
    const http = await listen(app);
    const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp/stream/http`;
    let rpc = 1;
    const post = (
      tool: string,
      args: Record<string, unknown>,
      signal?: AbortSignal,
    ) =>
      fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...basicHeaders(),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: rpc++,
          method: 'tools/call',
          params: { name: tool, arguments: args },
        }),
        ...(signal !== undefined ? { signal } : {}),
      });
    const textOf = async (response: Response) =>
      (
        (await response.json()) as {
          result: { content: Array<{ text: string }> };
        }
      ).result.content[0]?.text;
    const sessionOf = (match: (url: string) => boolean) =>
      standIn.requests.find((r) => match(r.url))?.session;
    let handle: string | undefined;
    let release = () => {};
    try {
      handle = await textOf(await post('HoldState', { id: 'P' }));
      assert.equal(typeof handle, 'string');
      const stateSession = sessionOf((u) => u.startsWith(listenUrl('P')));
      assert.notEqual(stateSession, undefined);

      const held = standIn.hold((r) => isLockOf('H1')(r.url));
      release = held.release;
      const drop = new AbortController();
      const dropped = post(
        'LockedUpdate',
        { id: 'H1', state_handle: handle },
        drop.signal,
      ).catch(() => 'dropped');
      await held.arrived;
      // The session the dropped call's tool runs in. (The earlier request's
      // connection, which this request's credential replaced, ends once no
      // call works on it, and is not counted here.)
      const toolSession = sessionOf(isLockOf('H1'));
      assert.notEqual(toolSession, undefined);
      const ownLoggedOff = () =>
        standIn
          .loggedOff()
          .filter(
            (session) => session === toolSession || session === stateSession,
          );
      drop.abort();
      assert.equal(await dropped, 'dropped');
      await pause();
      assert.deepStrictEqual(
        activeTools().map((t) => t.name),
        ['LockedUpdate'],
      );
      assert.equal(activeTools()[0]?.signal.aborted, false);
      // The drop logged off neither the tool's session nor the state's.
      assert.deepStrictEqual(ownLoggedOff(), []);

      held.release();
      await until(() => count(isUnlockOf('H1')) === 1);
      await until(() => activeTools().length === 0);
      await pause();
      assert.equal(count(isLockOf('H1')), 1);
      assert.equal(count(isUpdateOf('H1')), 1);
      assert.deepStrictEqual(runs.started, ['H1']);
      assert.deepStrictEqual(runs.answered, [
        { id: 'H1', text: 'H1', isError: false },
      ]);
      // Still neither logged off; the dropped call's requests ran in one session.
      assert.deepStrictEqual(ownLoggedOff(), []);
      assert.deepStrictEqual(
        standIn.requests
          .filter(
            (r) =>
              isLockOf('H1')(r.url) ||
              isUpdateOf('H1')(r.url) ||
              isUnlockOf('H1')(r.url),
          )
          .map((r) => r.session),
        [toolSession, toolSession, toolSession],
      );

      // The handle still reaches its instance; the state's session is kept.
      const next = await post('LockedUpdate', {
        id: 'H2',
        state_handle: handle,
      });
      assert.equal(await textOf(next), 'H2');
      const loggedOff: (string | undefined)[] = standIn.loggedOff();
      assert.ok(!loggedOff.includes(stateSession));
    } finally {
      release();
      // The state ends with its stop tool; the pool then lets the instance go.
      if (handle !== undefined) {
        await post('StopState', { state_handle: handle }).catch(
          () => undefined,
        );
      }
      await mcp.stop().catch(() => undefined);
      await closeServer(http);
    }
  });
});
