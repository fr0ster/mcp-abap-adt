/**
 * The envelope owner, `InstanceEnvelopes` (spec §3.1, §3.4), at owner
 * level: an explicit handle of 128 random bits per envelope; the consumer's
 * bound counted over every session key, refused at the bound with nothing
 * evicted; an unknown handle and another session's answer the same; the
 * claim synchronous; envelopes independent; no clock of its own; `dispose()`
 * lets every recorded call go and empties the owner.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { ServerRefusal } from '../../../lib/auth/serverRefusal';
import {
  InstanceEnvelopes,
  type SessionKey,
} from '../../../lib/batch/InstanceEnvelopes';

const contextA = {};
const contextB = {};
const keyOf = (
  context: object,
  extra: Partial<SessionKey> = {},
): SessionKey => ({
  context,
  ...extra,
});

/** The refusal `act` throws, as the dispatch answers it: its code and words. */
function refusalOf(act: () => unknown): { code: string; words: string } {
  try {
    act();
  } catch (error) {
    assert.ok(error instanceof ServerRefusal);
    return { code: error.serverRefusal, words: error.message };
  }
  assert.fail('expected a refusal');
}

describe('InstanceEnvelopes', () => {
  it('a handle is 32 upper-case hex characters, none repeated over 10 000 creates', () => {
    const owner = new InstanceEnvelopes({ keepRawParts: false });
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const { handle } = owner.create(keyOf(contextA));
      assert.match(handle, /^[0-9A-F]{32}$/);
      seen.add(handle);
    }
    assert.equal(seen.size, 10_000);
  });

  it('the bound counts every key of the owner: at the bound a create is refused, nothing evicted', () => {
    const owner = new InstanceEnvelopes({
      keepRawParts: false,
      openEnvelopes: 2,
    });
    const a = owner.create(
      keyOf(contextA, { stateHandle: 'S', digest: Buffer.from('a') }),
    );
    const b = owner.create(
      keyOf(contextA, { stateHandle: 'S', digest: Buffer.from('b') }),
    );
    const refused = refusalOf(() =>
      owner.create(
        keyOf(contextA, { stateHandle: 'S', digest: Buffer.from('a') }),
      ),
    );
    assert.equal(refused.code, 'envelope_limit');
    assert.equal(
      refused.words,
      '2 envelopes are open, the bound set by --batch-open-envelopes / openEnvelopes; execute or discard one first',
    );
    assert.equal(owner.find(a.handle, a.key), a);
    assert.equal(owner.find(b.handle, b.key), b);
  });

  it('without the setting there is no bound', () => {
    const owner = new InstanceEnvelopes({ keepRawParts: false });
    for (let i = 0; i < 1_000; i++) owner.create(keyOf(contextA));
    assert.equal(owner.list(keyOf(contextA)).length, 1_000);
  });

  it("an unknown handle and another session's handle get the same refusal from find, claim and discard", () => {
    const owner = new InstanceEnvelopes({ keepRawParts: false });
    const envelope = owner.create(
      keyOf(contextA, { stateHandle: 'S', digest: Buffer.from('a') }),
    );
    const others: SessionKey[] = [
      keyOf(contextB, { stateHandle: 'S', digest: Buffer.from('a') }),
      keyOf(contextA, { stateHandle: 'T', digest: Buffer.from('a') }),
      keyOf(contextA, { digest: Buffer.from('a') }),
      keyOf(contextA, { stateHandle: 'S', digest: Buffer.from('b') }),
      keyOf(contextA, { stateHandle: 'S' }),
    ];
    const unknown = 'F'.repeat(32);
    for (const act of ['find', 'claim', 'discard'] as const) {
      const ofUnknown = refusalOf(() => owner[act](unknown, envelope.key));
      assert.deepStrictEqual(ofUnknown, {
        code: 'envelope_unavailable',
        words: 'envelope is not available',
      });
      for (const other of others) {
        assert.deepStrictEqual(
          refusalOf(() => owner[act](envelope.handle, other)),
          ofUnknown,
        );
      }
    }
    // None of those changed anything.
    assert.equal(owner.find(envelope.handle, envelope.key), envelope);
  });

  it("list shows the matching key's envelopes alone, in creation order", () => {
    const owner = new InstanceEnvelopes({ keepRawParts: false });
    const mine = keyOf(contextA, {
      stateHandle: 'S',
      digest: Buffer.from('a'),
    });
    const first = owner.create(mine);
    owner.create(
      keyOf(contextA, { stateHandle: 'S', digest: Buffer.from('b') }),
    );
    const second = owner.create(mine);
    assert.deepStrictEqual(
      owner.list(mine).map((e) => e.handle),
      [first.handle, second.handle],
    );
  });

  it('the claim is synchronous: the handle is gone before anything is awaited', () => {
    const owner = new InstanceEnvelopes({ keepRawParts: false });
    const envelope = owner.create(keyOf(contextA));
    assert.equal(owner.claim(envelope.handle, envelope.key), envelope);
    assert.equal(envelope.isOpen(), false);
    assert.equal(
      refusalOf(() => owner.claim(envelope.handle, envelope.key)).code,
      'envelope_unavailable',
    );
    assert.equal(
      refusalOf(() => owner.discard(envelope.handle, envelope.key)).code,
      'envelope_unavailable',
    );
  });

  it('two envelopes keep separate numbering, and survive each other being claimed or discarded', () => {
    const owner = new InstanceEnvelopes({ keepRawParts: false });
    const a = owner.create(keyOf(contextA));
    const b = owner.create(keyOf(contextA));
    assert.equal(a.nextNumber(), 1);
    assert.equal(a.nextNumber(), 2);
    assert.equal(b.nextNumber(), 1);
    owner.claim(a.handle, a.key);
    assert.equal(owner.find(b.handle, b.key), b);
    assert.equal(b.nextNumber(), 2);
    const c = owner.create(keyOf(contextA));
    owner.discard(b.handle, b.key);
    assert.equal(owner.find(c.handle, c.key), c);
  });

  it("discard aborts the envelope's signal and every call's own", () => {
    const owner = new InstanceEnvelopes({ keepRawParts: false });
    const envelope = owner.create(keyOf(contextA));
    const call = envelope.callSignal();
    owner.discard(envelope.handle, envelope.key);
    assert.equal(envelope.signal().aborted, true);
    assert.equal(call.signal.aborted, true);
  });

  it("a call's own signal aborts alone, the envelope's staying live", () => {
    const owner = new InstanceEnvelopes({ keepRawParts: false });
    const envelope = owner.create(keyOf(contextA));
    const one = envelope.callSignal();
    const two = envelope.callSignal();
    one.abort();
    assert.equal(one.signal.aborted, true);
    assert.equal(two.signal.aborted, false);
    assert.equal(envelope.signal().aborted, false);
  });

  it('holds state while an envelope is open, and tells its observers', () => {
    const owner = new InstanceEnvelopes({ keepRawParts: false });
    const changes = mock.fn();
    owner.observe(changes);
    assert.equal(owner.holdsState(), false);
    const envelope = owner.create(keyOf(contextA));
    assert.equal(owner.holdsState(), true);
    owner.claim(envelope.handle, envelope.key);
    assert.equal(owner.holdsState(), false);
    assert.equal(changes.mock.callCount(), 2);
    assert.equal(owner.pending(), false);
    assert.deepStrictEqual(owner.failures(), []);
  });

  it('dispose lets every envelope and every call go, and empties the owner', async () => {
    const owner = new InstanceEnvelopes({ keepRawParts: false });
    const a = owner.create(keyOf(contextA));
    const b = owner.create(keyOf(contextB));
    const callA = a.callSignal();
    await owner.dispose();
    assert.equal(a.signal().aborted, true);
    assert.equal(b.signal().aborted, true);
    assert.equal(callA.signal.aborted, true);
    assert.equal(owner.holdsState(), false);
    assert.deepStrictEqual(owner.list(keyOf(contextA)), []);
    assert.equal(
      refusalOf(() => owner.find(a.handle, a.key)).code,
      'envelope_unavailable',
    );
  });

  it('no clock of its own: days pass and nothing ends', () => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
    try {
      const owner = new InstanceEnvelopes({ keepRawParts: false });
      const envelope = owner.create(keyOf(contextA));
      mock.timers.tick(7 * 24 * 60 * 60 * 1000);
      assert.equal(owner.find(envelope.handle, envelope.key), envelope);
      assert.equal(envelope.signal().aborted, false);
    } finally {
      mock.timers.reset();
    }
  });

  it('an arriving execution reserves its envelope: every other call meets envelope_unavailable; released, the envelope is as it was', () => {
    const owner = new InstanceEnvelopes({ keepRawParts: false });
    const envelope = owner.create(keyOf(contextA));
    envelope.nextNumber();
    const reserved = owner.reserve(envelope.handle, envelope.key);
    assert.equal(reserved, envelope);
    for (const act of ['find', 'discard', 'reserve'] as const) {
      assert.equal(
        refusalOf(() => owner[act](envelope.handle, envelope.key)).code,
        'envelope_unavailable',
        act,
      );
    }
    owner.release(envelope);
    assert.equal(owner.find(envelope.handle, envelope.key), envelope);
    assert.equal(envelope.recorded(), 1);
    owner.reserve(envelope.handle, envelope.key);
    assert.equal(owner.claim(envelope.handle, envelope.key), envelope);
    owner.release(envelope);
    assert.equal(
      refusalOf(() => owner.find(envelope.handle, envelope.key)).code,
      'envelope_unavailable',
    );
  });
});
