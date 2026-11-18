/**
 * The keep-alive wrapper on its own (`withSessionKeepAlive`): a fake
 * connection that records each request and answers at once (or when the
 * case releases it), and node:test's fake clock (`mock.timers`,
 * `setTimeout`). Through the server: `sessionKeepAlive.test.ts`.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import {
  SESSION_KEEP_ALIVE_FAILED_WORDS,
  SESSION_KEEP_ALIVE_URL,
  stopSessionKeepAlive,
  withSessionKeepAlive,
} from '../../../lib/sessionKeepAlive';

const MINUTE = 60_000;
const INTERVAL = 10 * MINUTE;

interface Fake {
  connection: IAbapConnection;
  urls: string[];
  connects: number;
  connected: boolean;
  /** The next request waits until `release()`. */
  holdNext(): { release(): void };
  /** Every request answers this status from now on (a `5xx` throws). */
  answer(status: number): void;
}

function fakeConnection(): Fake {
  const fake: Fake = {
    urls: [],
    connects: 0,
    connected: false,
    holdNext: () => ({ release: () => {} }),
    answer: () => {},
    connection: undefined as never,
  };
  let status = 200;
  let hold: Promise<void> | undefined;
  fake.holdNext = () => {
    let release: () => void = () => {};
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { release };
  };
  fake.answer = (next) => {
    status = next;
  };
  fake.connection = {
    connect: async () => {
      fake.connects += 1;
      fake.connected = true;
    },
    getBaseUrl: async () => 'http://fake',
    getSessionId: () => 'fake-session',
    setSessionType: () => {},
    isConnected: () => fake.connected,
    disconnect: async () => {
      fake.connected = false;
    },
    makeAdtRequest: async (
      options: IAbapRequestOptions,
    ): Promise<IAdtWireResponse> => {
      fake.urls.push(options.url);
      const waiting = hold;
      hold = undefined;
      if (waiting !== undefined) await waiting;
      if (status >= 500) {
        throw Object.assign(new Error('refused'), { response: { status } });
      }
      return { status, statusText: '', data: '', headers: {} } as never;
    },
  };
  return fake;
}

function wrap(fake: Fake, held: () => boolean = () => true) {
  const debug: string[] = [];
  const connection = withSessionKeepAlive(fake.connection, {
    intervalMs: INTERVAL,
    logger: {
      info() {},
      warn() {},
      error() {},
      debug: (line: string) => {
        debug.push(line);
      },
    },
    held,
  });
  return { connection, debug };
}

const pings = (fake: Fake) =>
  fake.urls.filter((url) => url === SESSION_KEEP_ALIVE_URL).length;

/** Lets pending promises settle; no timer. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe('the keep-alive wrapper', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] });
  });
  afterEach(() => {
    mock.timers.reset();
  });

  it('pings once the connection was idle for the whole interval, after connect', async () => {
    const fake = fakeConnection();
    const { connection } = wrap(fake);
    await connection.connect();
    mock.timers.tick(INTERVAL - 1);
    await settle();
    assert.equal(pings(fake), 0);
    mock.timers.tick(1);
    await settle();
    assert.equal(pings(fake), 1);
    // The ping's end re-arms it for a whole interval more.
    mock.timers.tick(INTERVAL);
    await settle();
    assert.equal(pings(fake), 2);
  });

  it('a request resets the clock', async () => {
    const fake = fakeConnection();
    const { connection } = wrap(fake);
    await connection.connect();
    mock.timers.tick(9 * MINUTE);
    await connection.makeAdtRequest({ url: '/a', method: 'GET', timeout: 0 });
    mock.timers.tick(9 * MINUTE);
    await settle();
    assert.equal(pings(fake), 0);
    mock.timers.tick(MINUTE);
    await settle();
    assert.equal(pings(fake), 1);
  });

  it('never pings while a request is in flight', async () => {
    const fake = fakeConnection();
    const { connection } = wrap(fake);
    await connection.connect();
    const held = fake.holdNext();
    const running = connection.makeAdtRequest({
      url: '/long',
      method: 'GET',
      timeout: 0,
    });
    mock.timers.tick(3 * INTERVAL);
    await settle();
    assert.equal(pings(fake), 0);
    held.release();
    await running;
    mock.timers.tick(INTERVAL);
    await settle();
    assert.equal(pings(fake), 1);
  });

  it('pings nothing and connects nothing before connect()', async () => {
    const fake = fakeConnection();
    wrap(fake);
    mock.timers.tick(3 * INTERVAL);
    await settle();
    assert.deepEqual(fake.urls, []);
    assert.equal(fake.connects, 0);
  });

  it('pings nothing and connects nothing once the connection is no longer connected', async () => {
    const fake = fakeConnection();
    const { connection } = wrap(fake);
    await connection.connect();
    fake.connected = false; // spent: SAP lost the session
    mock.timers.tick(3 * INTERVAL);
    await settle();
    assert.equal(pings(fake), 0);
    assert.equal(fake.connects, 1);
  });

  it('pings nothing while its holder says it is not held', async () => {
    const fake = fakeConnection();
    let held = true;
    const { connection } = wrap(fake, () => held);
    await connection.connect();
    held = false;
    mock.timers.tick(3 * INTERVAL);
    await settle();
    assert.equal(pings(fake), 0);
  });

  it('stops for good on disconnect()', async () => {
    const fake = fakeConnection();
    const { connection } = wrap(fake);
    await connection.connect();
    await connection.disconnect?.();
    fake.connected = true; // even were it connected again
    mock.timers.tick(3 * INTERVAL);
    await settle();
    assert.equal(pings(fake), 0);
  });

  it('stops for good on stopSessionKeepAlive (replaced)', async () => {
    const fake = fakeConnection();
    const { connection } = wrap(fake);
    await connection.connect();
    stopSessionKeepAlive(connection);
    await connection.makeAdtRequest({ url: '/a', method: 'GET', timeout: 0 });
    mock.timers.tick(3 * INTERVAL);
    await settle();
    assert.equal(pings(fake), 0);
  });

  it('a failed ping is one debug line with its status, not retried', async () => {
    const fake = fakeConnection();
    const { connection, debug } = wrap(fake);
    await connection.connect();
    fake.answer(503);
    mock.timers.tick(INTERVAL);
    await settle();
    assert.equal(pings(fake), 1);
    assert.deepEqual(debug, [`${SESSION_KEEP_ALIVE_FAILED_WORDS}: status 503`]);
    mock.timers.tick(INTERVAL - 1);
    await settle();
    assert.equal(pings(fake), 1, 'no retry inside the interval');
  });

  it('an interval of 0 returns the connection as it is', () => {
    const fake = fakeConnection();
    const same = withSessionKeepAlive(fake.connection, {
      intervalMs: 0,
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      held: () => true,
    });
    assert.equal(same, fake.connection);
  });

  it('forwards every other member as it is', async () => {
    const fake = fakeConnection();
    const { connection } = wrap(fake);
    assert.equal(connection.getSessionId(), 'fake-session');
    assert.equal(await connection.getBaseUrl(), 'http://fake');
    assert.equal(connection.isConnected?.(), false);
    await connection.connect();
    assert.equal(connection.isConnected?.(), true);
    assert.equal(connection.flushGoodbye, undefined, 'absent stays absent');
  });
});

describe('the keep-alive wrapper’s timer, on the real clock', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it('is unref’d, one at a time, and cleared by disconnect()', async () => {
    const armed: Array<ReturnType<typeof setTimeout>> = [];
    const cleared = new Set<unknown>();
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    mock.method(globalThis, 'setTimeout', (fn: () => void, ms?: number) => {
      const timer = realSet(fn, ms);
      if (ms === INTERVAL) armed.push(timer);
      return timer;
    });
    mock.method(
      globalThis,
      'clearTimeout',
      (timer: ReturnType<typeof setTimeout> | undefined) => {
        cleared.add(timer);
        realClear(timer);
      },
    );
    const fake = fakeConnection();
    const { connection } = wrap(fake);
    await connection.connect();
    await connection.makeAdtRequest({ url: '/a', method: 'GET', timeout: 0 });
    await connection.makeAdtRequest({ url: '/b', method: 'GET', timeout: 0 });
    assert.ok(armed.length >= 1);
    assert.equal(armed.filter((t) => !cleared.has(t)).length, 1);
    for (const timer of armed) assert.equal(timer.hasRef(), false);
    await connection.disconnect?.();
    assert.equal(armed.filter((t) => !cleared.has(t)).length, 0);
  });
});
