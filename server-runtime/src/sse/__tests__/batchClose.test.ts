/**
 * Batch mode on SSE is the connection's (spec §2, §8): each SSE connection's
 * instance has its own batch owner, and the connection's close — the
 * instance close — drops its open batch with nothing sent. Another open
 * connection's batch is untouched.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { CompactReadOnlyHandlersGroup } from '../../../../compact-readonly-entries/src/group';
import { isLogoff } from '../../../../src/__tests__/helpers/adtStandIn';
import { InstanceBatch } from '../../../../src/lib/batch/InstanceBatch';
import { CompactBatchHandlersGroup } from '../../../../src/lib/compact/batch/group';
import { type SseStand, sseStand, turns, until } from './shutdown/harness';

const placeholder = { connection: undefined } as unknown as HandlerContext;

let s: SseStand;
let owners: InstanceBatch[];

beforeEach(async () => {
  mock.method(console, 'error', () => {});
  owners = [];
  const begin = InstanceBatch.prototype.begin;
  mock.method(
    InstanceBatch.prototype,
    'begin',
    function (this: InstanceBatch, ...args: Parameters<typeof begin>) {
      if (!owners.includes(this)) owners.push(this);
      return begin.apply(this, args);
    },
  );
  s = await sseStand({
    server: { batch: { keepRawParts: false } },
    groups: [
      new CompactReadOnlyHandlersGroup(placeholder),
      new CompactBatchHandlersGroup(placeholder),
    ],
  });
});

afterEach(async () => {
  await s.close();
  mock.restoreAll();
});

const envelopes = () =>
  s.standIn.requests.filter((r) => r.url.includes('/communication/batch'));

it("an SSE close drops the connection's batch with nothing sent; another connection's batch is untouched", async () => {
  const closing = await s.open();
  const other = await s.open();

  await closing.call('HandlerBatch', { action: 'begin' }, 1);
  assert.equal((await closing.answer(1)).isError, false);
  await other.call('HandlerBatch', { action: 'begin' }, 1);
  assert.equal((await other.answer(1)).isError, false);
  // One owner per connection's instance.
  assert.equal(owners.length, 2);
  const [closingOwner, otherOwner] = owners as [InstanceBatch, InstanceBatch];
  assert.notEqual(closingOwner, otherOwner);

  await closing.call(
    'HandlerGet',
    { object_type: 'PROGRAM', program_name: 'PROG_A' },
    2,
  );
  assert.deepStrictEqual(await closing.answer(2), { text: '', isError: false });
  await other.call(
    'HandlerGet',
    { object_type: 'PROGRAM', program_name: 'PROG_B' },
    2,
  );
  assert.deepStrictEqual(await other.answer(2), { text: '', isError: false });
  assert.equal(closingOwner.opened()?.recorded.length, 1);
  const signal = closingOwner.signal();

  closing.close();
  await until(() => s.standIn.logoffs() === 1);
  await until(() => closingOwner.mode() === 'off');
  assert.equal(signal.aborted, true);
  assert.equal(closingOwner.holdsState(), false);
  await turns(20);
  assert.deepStrictEqual(envelopes(), []);
  // The logoff is the only request after the recording.
  assert.equal(s.standIn.requests.filter((r) => isLogoff(r.url)).length, 1);

  // The other connection's batch is still open, its call still recorded.
  assert.equal(otherOwner.mode(), 'communication');
  assert.equal(otherOwner.opened()?.recorded.length, 1);
  assert.equal(otherOwner.signal().aborted, false);
});
