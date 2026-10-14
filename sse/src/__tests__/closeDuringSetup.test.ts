/**
 * RF8, the setup window (spec §6.4, D51): an SSE connection closes, or
 * `server.connect` rejects, while it is still being set up — and a
 * host's stop arrives during setup. Each time the instance close runs once
 * (its state let go — main's failed-`connect` path did not), no session
 * entry is left, and the instance is never routed to.
 */

import { EventEmitter } from 'node:events';
import { BaseMcpServer } from '@mcp-abap-adt/lib/embeddable';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { resetProcessLatchForTests } from '../../../src/lib/activeTools';
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
  res.writeHead = jest.fn(() => res);
  res.write = jest.fn(() => true);
  res.end = jest.fn(() => res);
  res.status = jest.fn(() => res);
  res.send = jest.fn(() => res);
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

let letGoOfState: jest.SpyInstance;
let connect: jest.SpyInstance;

beforeEach(() => {
  resetProcessLatchForTests();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  letGoOfState = jest.spyOn(BaseMcpServer.prototype, 'letGoOfState');
  connect = jest.spyOn(BaseMcpServer.prototype, 'connect');
});

afterEach(() => jest.restoreAllMocks());

it('the response closes while connect() is held: one instance close, never routed to', async () => {
  const held = deferred();
  connect.mockReturnValue(held.promise);
  const { sse, routes } = external();
  const res = fakeRes();
  const getting = routes['/sse']({ headers: CREDENTIALS, query: {} }, res);
  await turns();
  res.emit('close');
  await turns();
  expect(letGoOfState).toHaveBeenCalledTimes(1);
  held.resolve();
  await getting;
  await turns();
  expect(sessionsOf(sse).size).toBe(0);
  expect(letGoOfState).toHaveBeenCalledTimes(1);
  await sse.stop();
  expect(letGoOfState).toHaveBeenCalledTimes(1);
});

it('connect() rejects: the instance close runs once (the state is let go), no entry is left', async () => {
  connect.mockRejectedValue(new Error('transport broke'));
  const { sse, routes } = external();
  const res = fakeRes();
  await routes['/sse']({ headers: CREDENTIALS, query: {} }, res);
  await turns();
  expect(letGoOfState).toHaveBeenCalledTimes(1);
  expect(sessionsOf(sse).size).toBe(0);
  res.emit('close');
  await turns();
  expect(letGoOfState).toHaveBeenCalledTimes(1);
  await sse.stop();
  expect(letGoOfState).toHaveBeenCalledTimes(1);
});

it('a stop during setup awaits the same cleanup: one instance close', async () => {
  const held = deferred();
  connect.mockReturnValue(held.promise);
  const { sse, routes } = external();
  const res = fakeRes();
  const getting = routes['/sse']({ headers: CREDENTIALS, query: {} }, res);
  await turns();
  let stopped = false;
  const stopping = sse.stop().then(() => {
    stopped = true;
  });
  await turns();
  expect(letGoOfState).toHaveBeenCalledTimes(1);
  held.resolve();
  await getting;
  await stopping;
  expect(stopped).toBe(true);
  res.emit('close');
  await turns();
  expect(letGoOfState).toHaveBeenCalledTimes(1);
  expect(sessionsOf(sse).size).toBe(0);
});
