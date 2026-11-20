/**
 * The setup window: an SSE connection closes, or
 * `server.connect` rejects, while it is still being set up — and a
 * host's stop arrives during setup. Each time the instance close runs once
 * (its state let go — main's failed-`connect` path did not), no session
 * entry is left, and the instance is never routed to.
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, it, type Mock, mock } from 'node:test';
import { BaseMcpServer } from '@mcp-abap-adt/lib/embeddable';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { resetProcessLatchForTests } from '../../../../src/lib/activeTools';
import { SseServer } from '../SseServer.js';

const CREDENTIALS = {
  'x-sap-url': 'https://sap.invalid',
  'x-sap-jwt-token': 'header.payload.signature',
};

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const turns = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r));
};

function fakeRes() {
  const res: any = new EventEmitter();
  res.headersSent = false;
  res.writeHead = mock.fn(() => res);
  res.write = mock.fn(() => true);
  res.end = mock.fn(() => res);
  res.status = mock.fn(() => res);
  res.send = mock.fn(() => res);
  res.on = res.on.bind(res);
  return res;
}

function external() {
  const routes: Record<string, any> = {};
  const app: any = {
    get: (p: string, h: any) => {
      routes[p] = h;
    },
    post: (p: string, h: any) => {
      routes[p] = h;
    },
  };
  const sse = new SseServer(new CompositeHandlersRegistry([]), {
    app,
    stateLogger: { error() {} },
  });
  sse.registerRoutes(app);
  return { sse, routes };
}

const sessionsOf = (sse: SseServer) =>
  (sse as unknown as { sessions: Map<string, unknown> }).sessions;

let letGoOfState: Mock<BaseMcpServer['letGoOfState']>;
let connect: Mock<BaseMcpServer['connect']>;

beforeEach(() => {
  resetProcessLatchForTests();
  mock.method(console, 'error', () => {});
  letGoOfState = mock.method(BaseMcpServer.prototype, 'letGoOfState');
  connect = mock.method(BaseMcpServer.prototype, 'connect');
});

afterEach(() => mock.restoreAll());

it('the response closes while connect() is held: one instance close, never routed to', async () => {
  const held = deferred();
  connect.mock.mockImplementation(() => held.promise);
  const { sse, routes } = external();
  const res = fakeRes();
  const getting = routes['/sse']({ headers: CREDENTIALS, query: {} }, res);
  await turns();
  res.emit('close');
  await turns();
  assert.equal(letGoOfState.mock.callCount(), 1);
  held.resolve();
  await getting;
  await turns();
  assert.equal(sessionsOf(sse).size, 0);
  assert.equal(letGoOfState.mock.callCount(), 1);
  await sse.stop();
  assert.equal(letGoOfState.mock.callCount(), 1);
});

it('connect() rejects: the instance close runs once (the state is let go), no entry is left', async () => {
  const broke = new Error('transport broke');
  connect.mock.mockImplementation(async () => {
    throw broke;
  });
  const { sse, routes } = external();
  const res = fakeRes();
  await routes['/sse']({ headers: CREDENTIALS, query: {} }, res);
  await turns();
  assert.equal(letGoOfState.mock.callCount(), 1);
  assert.equal(sessionsOf(sse).size, 0);
  res.emit('close');
  await turns();
  assert.equal(letGoOfState.mock.callCount(), 1);
  await sse.stop();
  assert.equal(letGoOfState.mock.callCount(), 1);
});

it('a stop during setup awaits the same cleanup: one instance close', async () => {
  const held = deferred();
  connect.mock.mockImplementation(() => held.promise);
  const { sse, routes } = external();
  const res = fakeRes();
  const getting = routes['/sse']({ headers: CREDENTIALS, query: {} }, res);
  await turns();
  let stopped = false;
  const stopping = sse.stop().then(() => {
    stopped = true;
  });
  await turns();
  assert.equal(letGoOfState.mock.callCount(), 1);
  held.resolve();
  await getting;
  await stopping;
  assert.equal(stopped, true);
  res.emit('close');
  await turns();
  assert.equal(letGoOfState.mock.callCount(), 1);
  assert.equal(sessionsOf(sse).size, 0);
});
