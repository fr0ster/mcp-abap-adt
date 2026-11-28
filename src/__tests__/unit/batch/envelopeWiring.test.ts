/**
 * The envelope owner's wiring (spec §3.2, §3.4): the host hands an instance
 * its own owner, attached to the instance state — an open envelope is held
 * state —; the instance close drops every envelope, nothing sent; the
 * embedder's bound is checked by the owner it builds.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { InstanceEnvelopes } from '../../../lib/batch/InstanceEnvelopes';

const fakeConnection = {
  connect: async () => undefined,
  getBaseUrl: async () => 'https://system.invalid',
  getSessionId: () => null,
  setSessionType: () => undefined,
  makeAdtRequest: async () => {
    throw new Error('nothing is sent here');
  },
};

const embedded = (envelopes?: InstanceEnvelopes) =>
  new EmbeddableMcpServer({
    connection: fakeConnection as never,
    systemType: 'onprem',
    ...(envelopes !== undefined && { envelopes }),
  } as never);

describe('the envelope owner of an instance', () => {
  it('two instances get distinct owners, each attached to its own state', () => {
    const a = new InstanceEnvelopes({ keepRawParts: false });
    const b = new InstanceEnvelopes({ keepRawParts: false });
    const first = embedded(a);
    const second = embedded(b);
    a.create({ context: {} });
    assert.equal(first.state.holdsState(), true);
    assert.equal(second.state.holdsState(), false);
  });

  it('an instance built without an owner holds no envelope state', () => {
    const server = embedded();
    assert.equal(server.state.holdsState(), false);
  });

  it('the instance close drops every envelope: nothing sent, the owner empty', async () => {
    const owner = new InstanceEnvelopes({ keepRawParts: false });
    const server = embedded(owner);
    const envelope = owner.create({ context: {} });
    server.dropBatch();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(envelope.signal().aborted, true);
    assert.equal(owner.holdsState(), false);
    assert.equal(server.state.holdsState(), false);
  });

  it("the embedder's openEnvelopes: a positive whole number, else refused with its name; absent, no bound", () => {
    assert.equal(
      new InstanceEnvelopes({ keepRawParts: false, openEnvelopes: 4 })
        .openEnvelopes,
      4,
    );
    assert.equal(
      new InstanceEnvelopes({ keepRawParts: false }).openEnvelopes,
      undefined,
    );
    for (const value of [0, -1, 1.5]) {
      assert.throws(
        () =>
          new InstanceEnvelopes({ keepRawParts: false, openEnvelopes: value }),
        (error: unknown) =>
          error instanceof Error &&
          error.message ===
            'Invalid openEnvelopes: must be a positive whole number of envelopes',
      );
    }
  });
});
