/**
 * The SSE session's instance is disposed when its connection closes, and
 * stop() waits for every disposal (no timer) and rejects with what was left.
 */

import { EventEmitter } from 'node:events';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { IDestinations } from '@mcp-abap-adt/lib/auth';
import { BaseMcpServer } from '@mcp-abap-adt/lib/embeddable';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { SseServer } from '../SseServer.js';

const stubDestinations: IDestinations = {
  settingsFor: jest.fn(),
  getProvider: jest.fn(),
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
  return new SseServer(new CompositeHandlersRegistry([]), stubDestinations, {
    host: '127.0.0.1',
    port: 0,
    defaultDestination: 'D',
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
  let shutdown: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest
      .spyOn(BaseMcpServer.prototype as any, 'setConnectionContext')
      .mockResolvedValue(undefined);
    jest
      .spyOn(BaseMcpServer.prototype as any, 'getConnection')
      .mockResolvedValue({});
    shutdown = jest.spyOn(BaseMcpServer.prototype, 'shutdownState');
  });
  afterEach(() => jest.restoreAllMocks());

  it('when the connection closes: once; stop() is pending until it settles', async () => {
    const release = deferred<string[]>();
    const called = deferred<void>();
    shutdown.mockImplementation(() => {
      called.resolve();
      return release.promise;
    });
    const sse = make();
    await sse.start();
    const port = (sse as any).standaloneServer.address() as AddressInfo;

    const req = http.get({ host: '127.0.0.1', port: port.port, path: '/sse' });
    req.on('error', () => {});
    await new Promise<void>((resolve) => req.once('response', () => resolve()));
    req.destroy();
    await called.promise;
    expect(shutdown).toHaveBeenCalledTimes(1);

    let stopped = false;
    const stopping = sse.stop().then(() => {
      stopped = true;
    });
    await tick();
    await tick();
    expect(stopped).toBe(false);
    release.resolve([]);
    await stopping;
    expect(stopped).toBe(true);
  });

  it('on an external app: stop() disposes the open sessions, and rejects with what was left', async () => {
    shutdown.mockResolvedValue(['a lock could not be released']);
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
    await routes['/sse']({ headers: {}, query: {} }, res);
    expect(shutdown).not.toHaveBeenCalled();

    await expect(sse.stop()).rejects.toThrow(
      /state cleanup failed: .*a lock could not be released/,
    );
    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it('a close during stop()\'s drain does not dispose twice, and stop() reports its failure', async () => {
    const release = deferred<string[]>();
    shutdown.mockReturnValue(release.promise);
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
    await routes['/sse']({ headers: {}, query: {} }, res);
    const stopping = sse.stop();
    await tick();
    res.emit('close');
    await tick();
    expect(shutdown).toHaveBeenCalledTimes(1);
    release.resolve(['left behind']);
    await expect(stopping).rejects.toThrow(/left behind/);
    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  // The failure of a session that finished closing BEFORE stop() ran is only
  // logged and then forgotten: stop() reports what it drains, and a settled
  // closing is no longer pending. Here the close is still pending when stop() runs.
  it('a close that leaves something is logged with it, and stop() reports it too', async () => {
    shutdown.mockResolvedValue(['a session was left']);
    const logger = {
      error: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    };
    const routes: Record<string, any> = {};
    const app: any = {
      get: (p: string, h: any) => {
        routes[p] = h;
      },
      post: jest.fn(),
    };
    const sse = make({ app, logger });
    sse.registerRoutes(app);
    const res = fakeRes();
    await routes['/sse']({ headers: {}, query: {} }, res);
    res.emit('close');
    await expect(sse.stop()).rejects.toThrow(/a session was left/);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('a session was left'),
    );
  });
});
