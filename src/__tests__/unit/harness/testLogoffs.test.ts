/**
 * The integration harness lets each of its logoffs finish before a test file
 * ends, as the server's orderly end does: the setup file's close of tracked
 * connections and the debugger cases' `logOffLeft` follow every logoff with
 * the connection's `flushGoodbye()` (no bound: no timer; never rejects) until
 * SAP answered it or its transport failed. Nothing reads the answer. SAP ends
 * a security session only once it received the logoff whole; Jest's
 * `--forceExit` would otherwise close the socket first (measured on premise
 * 2026-10-19: the test's own connection stayed in SM05).
 */

import { own } from '../../../lib/ownedConnections';
import { logOffLeft } from '../../integration/helpers/debuggerCleanup';
import {
  closeTrackedConnections,
  endTestConnection,
  trackConnection,
} from '../../integration/helpers/openConnections';

function fakeConnection() {
  let answer!: () => void;
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  const flushes: unknown[][] = [];
  const connection = {
    disconnect: jest.fn(async () => undefined),
    flushGoodbye: jest.fn(async (...args: unknown[]) => {
      flushes.push(args);
      await answered;
    }),
  };
  return { connection, answer, flushes };
}

async function settles(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(() => {
    done = true;
  });
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  return done;
}

describe("the harness's logoffs", () => {
  it('the close of tracked connections resolves once each logoff is answered; no bound passed', async () => {
    const c = fakeConnection();
    trackConnection(c.connection);
    const closing = closeTrackedConnections();
    expect(await settles(closing)).toBe(false);
    c.answer();
    expect(await settles(closing)).toBe(true);
    expect(c.connection.disconnect).toHaveBeenCalledTimes(1);
    expect(c.flushes).toEqual([[]]);
  });

  it("endTestConnection: a test's own close waits the same way", async () => {
    const c = fakeConnection();
    const ending = endTestConnection(c.connection);
    expect(await settles(ending)).toBe(false);
    c.answer();
    expect(await settles(ending)).toBe(true);
  });

  it("logOffLeft resolves once the logoffs of the server's connections it ended are answered", async () => {
    const before = new Set<object>();
    const c = fakeConnection();
    own(c.connection, { role: 'state' });
    const left = logOffLeft(before, 'a case');
    expect(await settles(left)).toBe(false);
    c.answer();
    expect(await settles(left)).toBe(true);
    expect(await left).toHaveLength(1);
  });
});
