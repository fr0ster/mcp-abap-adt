/**
 * The process's orderly end and an instance's terminal close let every
 * logoff finish before they resolve: each logoff, once written, is followed
 * until SAP's answer — any answer — or its transport's failure
 * (`flushGoodbye()`, called with no bound: the connection sets no timer).
 * Measured on premise (2026-10-19): sessions whose logoff went out right
 * before the process ended stayed in SM05 until their timeout; with the
 * process alive until the logoffs were answered, none stayed. Nothing reads
 * the answer. The forced close still ends at the writes.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  closeOwnedConnections,
  endConnection,
  forceClose,
  own,
} from '../../lib/ownedConnections';
import { logOffAtOnce } from '../../lib/shutdownSequence';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** A connection whose logoff is written at once and answered when told. */
function fakeConnection() {
  const answer = deferred();
  const flushes: unknown[][] = [];
  const connection = {
    disconnect: mock.fn(async () => undefined),
    flushGoodbye: mock.fn(async (...args: unknown[]) => {
      flushes.push(args);
      await answer.promise;
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

describe("the logoffs' answers at the end", () => {
  it('the logoffs at once resolve only once every logoff has been answered — one ended earlier by its site too', async () => {
    const owner = {};
    const atOnce = fakeConnection();
    const earlier = fakeConnection();
    own(atOnce.connection, { role: 'built', owner });
    own(earlier.connection, { role: 'state', owner });
    await endConnection(earlier.connection); // a site's own end: written
    const ending = logOffAtOnce();
    assert.equal(await settles(ending), false);
    atOnce.answer.resolve();
    assert.equal(await settles(ending), false); // the earlier one still unanswered
    earlier.answer.resolve();
    assert.equal(await settles(ending), true);
    // Followed with no bound of ours: no timeout passed.
    assert.deepStrictEqual(atOnce.flushes, [[]]);
    assert.deepStrictEqual(earlier.flushes, [[]]);
    assert.equal(atOnce.connection.disconnect.mock.callCount(), 1);
  });

  it("an instance's terminal close resolves once its logoffs have been answered", async () => {
    const owner = {};
    const c = fakeConnection();
    own(c.connection, { role: 'built', owner });
    const closing = closeOwnedConnections(owner);
    assert.equal(await settles(closing), false);
    c.answer.resolve();
    assert.equal(await settles(closing), true);
  });

  it('a logoff whose answer fails ends the wait as an answer does', async () => {
    const owner = {};
    const c = fakeConnection();
    c.connection.flushGoodbye.mock.mockImplementation(async () => {
      throw new Error('socket hang up');
    });
    own(c.connection, { role: 'built', owner });
    assert.equal(await settles(closeOwnedConnections(owner)), true);
  });

  it('the forced close ends at the writes', async () => {
    const owner = {};
    const c = fakeConnection();
    own(c.connection, { role: 'built', owner });
    assert.equal(await settles(forceClose()), true);
    c.answer.resolve();
  });
});
