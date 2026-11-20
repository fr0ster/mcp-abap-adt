/**
 * The SSE session's instance is disposed when its connection closes — once
 * — and stop() waits for every close (no timer).
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  afterEach,
  beforeEach,
  describe,
  it,
  type Mock,
  mock,
} from 'node:test';
import { BaseMcpServer } from '@mcp-abap-adt/lib/embeddable';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { SseServer } from '../SseServer.js';

/** The opening GET carries the connection's credentials. */
const CREDENTIALS = {
  'x-sap-url': 'https://sap.invalid',
  'x-sap-jwt-token': 'header.payload.signature',
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const tick = () => new Promise((r) => setImmediate(r));

function make(opts: object = {}) {
  // An external app takes no listener options (D26 E7).
  const listener = 'app' in opts ? {} : { host: '127.0.0.1', port: 0 };
  return new SseServer(new CompositeHandlersRegistry([]), {
    ...listener,
    ...opts,
  });
}

/** A response the transport can write to, closed by hand. */
function fakeRes() {
  const res: any = new EventEmitter();
  res.headersSent = false;
  res.writeHead = mock.fn(() => res);
  res.write = mock.fn(() => true);
  res.end = mock.fn(() => res);
  res.status = mock.fn(() => res);
  res.send = mock.fn(() => res);
  return res;
}

describe('SseServer disposes the instance of a session', () => {
  let letGo: Mock<BaseMcpServer['letGoOfState']>;
  let mcpClose: Mock<BaseMcpServer['close']>;
  let errorSpy: Mock<typeof console.error>;
  beforeEach(() => {
    errorSpy = mock.method(console, 'error', () => {});
    const connection = {};
    mock.method(
      BaseMcpServer.prototype as unknown as {
        getConnection(): Promise<unknown>;
      },
      'getConnection',
      async () => connection,
    );
    letGo = mock.method(BaseMcpServer.prototype, 'letGoOfState');
    mcpClose = mock.method(BaseMcpServer.prototype, 'close');
  });
  afterEach(() => {
    errorSpy.mock.restore();
    mock.restoreAll();
  });

  it('when the connection closes: once; stop() is pending until it settles', async () => {
    const release = deferred<void>();
    const called = deferred<void>();
    mcpClose.mock.mockImplementation(() => {
      called.resolve();
      return release.promise;
    });
    const sse = make();
    await sse.start();
    const port = (sse as any).standaloneServer.address() as AddressInfo;
    // Stopped whatever a check says: a server left listening keeps the
    // file's process alive.
    try {
      const req = http.get({
        host: '127.0.0.1',
        port: port.port,
        path: '/sse',
        headers: CREDENTIALS,
      });
      req.on('error', () => {});
      await new Promise<void>((resolve) =>
        req.once('response', () => resolve()),
      );
      req.destroy();
      await called.promise;
      assert.equal(letGo.mock.callCount(), 1);

      let stopped = false;
      const stopping = sse.stop().then(() => {
        stopped = true;
      });
      await tick();
      await tick();
      assert.equal(stopped, false);
      release.resolve();
      await stopping;
      assert.equal(stopped, true);
      assert.equal(letGo.mock.callCount(), 1);
    } finally {
      release.resolve();
      await sse.stop();
    }
  });

  it('on an external app: stop() closes the open sessions', async () => {
    const routes: Record<string, any> = {};
    const app: any = {
      get: (p: string, h: any) => {
        routes[p] = h;
      },
      post: mock.fn(),
    };
    const sse = make({ app });
    sse.registerRoutes(app);
    const res = fakeRes();
    await routes['/sse']({ headers: CREDENTIALS, query: {} }, res);
    assert.equal(letGo.mock.callCount(), 0);

    await sse.stop();
    assert.equal(letGo.mock.callCount(), 1);
  });

  it("a close during stop()'s drain does not close twice", async () => {
    const release = deferred<void>();
    mcpClose.mock.mockImplementation(() => release.promise);
    const routes: Record<string, any> = {};
    const app: any = {
      get: (p: string, h: any) => {
        routes[p] = h;
      },
      post: mock.fn(),
    };
    const sse = make({ app });
    sse.registerRoutes(app);
    const res = fakeRes();
    await routes['/sse']({ headers: CREDENTIALS, query: {} }, res);
    const stopping = sse.stop();
    await tick();
    res.emit('close');
    await tick();
    assert.equal(letGo.mock.callCount(), 1);
    release.resolve();
    await stopping;
    assert.equal(letGo.mock.callCount(), 1);
    assert.equal(mcpClose.mock.callCount(), 1);
  });
});
