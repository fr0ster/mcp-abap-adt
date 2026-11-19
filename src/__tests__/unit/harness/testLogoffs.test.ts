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

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
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
    disconnect: mock.fn(async () => undefined),
    flushGoodbye: mock.fn(async (...args: unknown[]) => {
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
    assert.equal(await settles(closing), false);
    c.answer();
    assert.equal(await settles(closing), true);
    assert.equal(c.connection.disconnect.mock.callCount(), 1);
    assert.deepStrictEqual(c.flushes, [[]]);
  });

  it("endTestConnection: a test's own close waits the same way", async () => {
    const c = fakeConnection();
    const ending = endTestConnection(c.connection);
    assert.equal(await settles(ending), false);
    c.answer();
    assert.equal(await settles(ending), true);
  });

  it('a tracked connection the test ended itself is disconnected once: the close of tracked connections leaves it', async () => {
    const c = fakeConnection();
    trackConnection(c.connection);
    c.answer();
    await endTestConnection(c.connection);
    await closeTrackedConnections();
    assert.equal(c.connection.disconnect.mock.callCount(), 1);
  });

  it("logOffLeft resolves once the logoffs of the server's connections it ended are answered", async () => {
    const before = new Set<object>();
    const c = fakeConnection();
    own(c.connection, { role: 'state' });
    const left = logOffLeft(before, 'a case');
    assert.equal(await settles(left), false);
    c.answer();
    assert.equal(await settles(left), true);
    assert.equal((await left).length, 1);
  });
});
