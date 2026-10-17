/**
 * The SSE session's instance is disposed when its connection closes — once
 * — and stop() waits for every close (no timer).
 */

import { EventEmitter } from 'node:events';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
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
  return new SseServer(new CompositeHandlersRegistry([]), {
    host: '127.0.0.1',
    port: 0,
    ...opts,
  });
}

/** A response the transport can write to, closed by hand. */
function fakeRes() {
  const res: any = new EventEmitter();
  res.headersSent = false;
  res.writeHead = jest.fn(() => res);
  res.write = jest.fn(() => true);
  res.end = jest.fn(() => res);
  res.status = jest.fn(() => res);
  res.send = jest.fn(() => res);
  return res;
}

describe('SseServer disposes the instance of a session', () => {
  let letGo: jest.SpyInstance;
  let mcpClose: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest
      .spyOn(BaseMcpServer.prototype as any, 'getConnection')
      .mockResolvedValue({});
    letGo = jest.spyOn(BaseMcpServer.prototype, 'letGoOfState');
    mcpClose = jest.spyOn(BaseMcpServer.prototype, 'close');
  });
  afterEach(() => {
    errorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('when the connection closes: once; stop() is pending until it settles', async () => {
    const release = deferred<void>();
    const called = deferred<void>();
    mcpClose.mockImplementation(() => {
      called.resolve();
      return release.promise;
    });
    const sse = make();
    await sse.start();
    const port = (sse as any).standaloneServer.address() as AddressInfo;

    const req = http.get({
      host: '127.0.0.1',
      port: port.port,
      path: '/sse',
      headers: CREDENTIALS,
    });
    req.on('error', () => {});
    await new Promise<void>((resolve) => req.once('response', () => resolve()));
    req.destroy();
    await called.promise;
    expect(letGo).toHaveBeenCalledTimes(1);

    let stopped = false;
    const stopping = sse.stop().then(() => {
      stopped = true;
    });
    await tick();
    await tick();
    expect(stopped).toBe(false);
    release.resolve();
    await stopping;
    expect(stopped).toBe(true);
    expect(letGo).toHaveBeenCalledTimes(1);
  });

  it('on an external app: stop() closes the open sessions', async () => {
    const routes: Record<string, any> = {};
    const app: any = {
      get: (p: string, h: any) => {
        routes[p] = h;
      },
      post: jest.fn(),
    };
    const sse = make({ app });
    sse.registerRoutes(app);
    const res = fakeRes();
    await routes['/sse']({ headers: CREDENTIALS, query: {} }, res);
    expect(letGo).not.toHaveBeenCalled();

    await sse.stop();
    expect(letGo).toHaveBeenCalledTimes(1);
  });

  it("a close during stop()'s drain does not close twice", async () => {
    const release = deferred<void>();
    mcpClose.mockReturnValue(release.promise);
    const routes: Record<string, any> = {};
    const app: any = {
      get: (p: string, h: any) => {
        routes[p] = h;
      },
      post: jest.fn(),
    };
    const sse = make({ app });
    sse.registerRoutes(app);
    const res = fakeRes();
    await routes['/sse']({ headers: CREDENTIALS, query: {} }, res);
    const stopping = sse.stop();
    await tick();
    res.emit('close');
    await tick();
    expect(letGo).toHaveBeenCalledTimes(1);
    release.resolve();
    await stopping;
    expect(letGo).toHaveBeenCalledTimes(1);
    expect(mcpClose).toHaveBeenCalledTimes(1);
  });
});
