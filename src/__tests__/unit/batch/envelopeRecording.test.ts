/**
 * Recording by `envelope_handle` through real MCP dispatch (spec §5), on
 * `GetClass`, the first admitted core read:
 *
 * - a read with a handle is recorded and answers its number; without one it
 *   sends as before, also while an envelope is open; creating an envelope
 *   records nothing;
 * - a tool no core entry admits, given `envelope_handle` with any value, is
 *   refused `envelope_not_recordable`, nothing sent; an admitted read given a
 *   handle that is no string, or empty, gets the schema's refusal;
 * - `background: true` with a handle is refused `batch_no_background`; an
 *   undeclared `background` without one is dropped, as before;
 * - no owner: `envelopes_unavailable`; another session's handle and an
 *   unknown one answer the same, nothing recorded;
 * - a read with a handle reaches its envelope while a batch is open; execute, record and discard sent at once execute once; a lost SAP
 *   session between record and execute leaves the envelope valid; the
 *   instance's close lets every recorded call go, nothing sent.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { InstanceEnvelopes } from '../../../lib/batch/InstanceEnvelopes';
import { headerContext } from '../../../lib/httpTransport/headerSource';
import { closeInstance } from '../../../lib/instanceClose';
import type { InnerRequest, PartAnswer } from '../../helpers/batchEnvelope';
import { batchStand, payloadOf } from '../../helpers/batchStand';

process.env.SAP_SYSTEM_TYPE = 'onprem';

afterEach(() => mock.restoreAll());

const sap = (inner: InnerRequest): PartAnswer => ({
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'text/plain' },
  body: `source of ${inner.url}`,
});

async function stand(options: { stateHandleArgument?: boolean } = {}) {
  const owner = new InstanceEnvelopes({ keepRawParts: false });
  const s = await batchStand({
    tools: ['GetClass', 'GetTable'],
    part: sap,
    envelopes: owner,
    ...options,
  });
  const create = async () =>
    payloadOf(await s.call('CreateReadEnvelope')).envelope_handle as string;
  const envelopesSent = () => s.built.flatMap((b) => b.envelopes).length;
  const directs = () => s.built.flatMap((b) => b.directs).length;
  return { s, owner, create, envelopesSent, directs };
}

describe('recording by envelope_handle', () => {
  it('a read with a handle answers its number and sends nothing; executed, it answers as the read does', async () => {
    const { s, create, envelopesSent, directs } = await stand();
    const handle = await create();
    const first = await s.call('GetClass', {
      class_name: 'CLAS_A',
      envelope_handle: handle,
    });
    const second = await s.call('GetClass', {
      class_name: 'CLAS_B',
      envelope_handle: handle,
    });
    assert.deepStrictEqual(payloadOf(first), {
      envelope_handle: handle,
      number: 1,
    });
    assert.deepStrictEqual(payloadOf(second), {
      envelope_handle: handle,
      number: 2,
    });
    assert.equal(envelopesSent(), 0);
    assert.equal(directs(), 0);
    const outside = await s.call('GetClass', { class_name: 'CLAS_A' });
    const executed = payloadOf(
      await s.call('ExecuteReadEnvelope', { envelope_handle: handle }),
    ) as Array<{ number: number; content: unknown }>;
    assert.equal(envelopesSent(), 1);
    assert.deepStrictEqual(
      executed.map((a) => a.number),
      [1, 2],
    );
    assert.deepStrictEqual(executed[0]?.content, outside.content);
    await s.close();
  });

  it('without a handle a read sends as before, also while an envelope is open; creating one records nothing', async () => {
    const { s, create, envelopesSent, directs } = await stand();
    const handle = await create();
    const answer = await s.call('GetClass', { class_name: 'CLAS_A' });
    assert.notEqual(answer.isError, true);
    assert.equal(directs(), 1);
    assert.equal(envelopesSent(), 0);
    assert.deepStrictEqual(payloadOf(await s.call('ListReadEnvelopes')), [
      { envelope_handle: handle, recorded: 0 },
    ]);
    await s.close();
  });

  it('a tool no core entry admits, given envelope_handle with any value, is refused envelope_not_recordable, nothing sent', async () => {
    const { s, create } = await stand();
    const handle = await create();
    for (const value of [handle, 'x', '', null, 42]) {
      const answer = await s.call('GetTable', {
        table_name: 'TAB_A',
        envelope_handle: value,
      });
      assert.equal(answer.isError, true, JSON.stringify(value));
      assert.equal(payloadOf(answer).error, 'envelope_not_recordable');
      assert.equal(
        payloadOf(answer).message,
        'GetTable is not recorded into an envelope with these arguments; call it without envelope_handle',
      );
    }
    assert.equal(s.resolves(), 0);
    await s.close();
  });

  it('an admitted read given a handle that is empty, null or no string gets the schema refusal', async () => {
    const { s } = await stand();
    for (const value of ['', null, 42]) {
      const answer = await s.call('GetClass', {
        class_name: 'CLAS_A',
        envelope_handle: value,
      });
      assert.equal(answer.isError, true);
      assert.match(
        answer.content?.[0]?.text ?? '',
        /Input validation error: Invalid arguments for tool GetClass/,
      );
    }
    assert.equal(s.resolves(), 0);
    await s.close();
  });

  it('background true with a handle is refused batch_no_background; without a handle an undeclared background is dropped', async () => {
    const { s, create, directs } = await stand();
    const handle = await create();
    const refused = await s.call('GetClass', {
      class_name: 'CLAS_A',
      envelope_handle: handle,
      background: true,
    });
    assert.equal(payloadOf(refused).error, 'batch_no_background');
    assert.equal(s.resolves(), 0);
    const plain = await s.call('GetClass', {
      class_name: 'CLAS_A',
      background: true,
    });
    assert.notEqual(plain.isError, true);
    assert.equal(directs(), 1);
    await s.close();
  });

  it('no owner: a read with a handle answers envelopes_unavailable, nothing sent', async () => {
    const { s } = await stand();
    Object.assign(s.server, { envelopes: undefined });
    const answer = await s.call('GetClass', {
      class_name: 'CLAS_A',
      envelope_handle: 'A'.repeat(32),
    });
    assert.equal(payloadOf(answer).error, 'envelopes_unavailable');
    assert.equal(s.resolves(), 0);
    await s.close();
  });

  it("another session's handle and an unknown one answer a read the same, nothing recorded, no connection taken", async () => {
    const { s, create } = await stand({ stateHandleArgument: true });
    s.useContext(
      headerContext({
        'x-sap-url': 'https://system.invalid',
        'x-sap-jwt-token': 'token-a',
      }),
    );
    const handle = await create();
    s.useContext(
      headerContext({
        'x-sap-url': 'https://system.invalid',
        'x-sap-jwt-token': 'token-b',
      }),
    );
    const foreign = await s.call('GetClass', {
      class_name: 'CLAS_A',
      envelope_handle: handle,
    });
    const unknown = await s.call('GetClass', {
      class_name: 'CLAS_A',
      envelope_handle: 'F'.repeat(32),
    });
    assert.deepStrictEqual(foreign, unknown);
    assert.equal(payloadOf(foreign).error, 'envelope_unavailable');
    assert.equal(s.resolves(), 0);
    s.useContext(
      headerContext({
        'x-sap-url': 'https://system.invalid',
        'x-sap-jwt-token': 'token-a',
      }),
    );
    assert.deepStrictEqual(payloadOf(await s.call('ListReadEnvelopes')), [
      { envelope_handle: handle, recorded: 0 },
    ]);
    await s.close();
  });

  it('a read with a handle reaches its envelope while a batch is open, which records nothing of it', async () => {
    const { s, create } = await stand();
    const handle = await create();
    s.begin();
    const recorded = await s.call('GetClass', {
      class_name: 'CLAS_A',
      envelope_handle: handle,
    });
    assert.deepStrictEqual(payloadOf(recorded), {
      envelope_handle: handle,
      number: 1,
    });
    // The open batch recorded nothing of it.
    assert.equal(s.owner.opened()?.recorded.length, 0);
    await s.close();
  });

  it('execute, record and discard at once: one send, the later ones envelope_unavailable', async () => {
    const { s, create, envelopesSent } = await stand();
    const handle = await create();
    await s.call('GetClass', { class_name: 'CLAS_A', envelope_handle: handle });
    const [executed, recorded, discarded] = await Promise.all([
      s.call('ExecuteReadEnvelope', { envelope_handle: handle }),
      s.call('GetClass', { class_name: 'CLAS_B', envelope_handle: handle }),
      s.call('DiscardReadEnvelope', { envelope_handle: handle }),
    ]);
    assert.notEqual(executed.isError, true);
    assert.equal(payloadOf(recorded).error, 'envelope_unavailable');
    assert.equal(payloadOf(discarded).error, 'envelope_unavailable');
    assert.equal(envelopesSent(), 1);
    await s.close();
  });

  it('a SAP session lost between record and execute: the envelope stays valid and goes on the connection in force', async () => {
    const { s, create, envelopesSent } = await stand();
    const handle = await create();
    await s.call('GetClass', { class_name: 'CLAS_A' });
    await s.call('GetClass', { class_name: 'CLAS_A', envelope_handle: handle });
    s.loseSession();
    const executed = await s.call('ExecuteReadEnvelope', {
      envelope_handle: handle,
    });
    assert.notEqual(executed.isError, true);
    assert.equal(envelopesSent(), 1);
    assert.equal(s.built.at(-1)?.envelopes.length, 1);
    await s.close();
  });

  it("the instance's close lets every recorded call go: nothing sent, the owner empty", async () => {
    const { s, owner, create, envelopesSent } = await stand();
    const handle = await create();
    await s.call('GetClass', { class_name: 'CLAS_A', envelope_handle: handle });
    await closeInstance(s.server);
    assert.equal(envelopesSent(), 0);
    assert.equal(owner.holdsState(), false);
  });
});
