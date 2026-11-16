/**
 * Batch mode on SSE is the connection's (spec §2, §8): each SSE connection's
 * instance has its own batch owner, and the connection's close — the
 * instance close — drops its open batch with nothing sent. Another open
 * connection's batch is untouched.
 */

import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { CompactReadOnlyHandlersGroup } from '../../../../compact-readonly-entries/src/group';
import { isLogoff } from '../../../../src/__tests__/helpers/adtStandIn';
import { InstanceBatch } from '../../../../src/lib/batch/InstanceBatch';
import { CompactBatchHandlersGroup } from '../../../../src/lib/compact/batch/group';
import { type SseStand, sseStand, turns, until } from './shutdown/harness';

jest.setTimeout(30_000);

const placeholder = { connection: undefined } as unknown as HandlerContext;

let s: SseStand;
let owners: InstanceBatch[];

beforeEach(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  owners = [];
  const begin = InstanceBatch.prototype.begin;
  jest.spyOn(InstanceBatch.prototype, 'begin').mockImplementation(function (
    this: InstanceBatch,
    ...args
  ) {
    if (!owners.includes(this)) owners.push(this);
    return begin.apply(this, args);
  });
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
  jest.restoreAllMocks();
});

const envelopes = () =>
  s.standIn.requests.filter((r) => r.url.includes('/communication/batch'));

it("an SSE close drops the connection's batch with nothing sent; another connection's batch is untouched", async () => {
  const closing = await s.open();
  const other = await s.open();

  await closing.call('HandlerBatch', { action: 'begin' }, 1);
  expect((await closing.answer(1)).isError).toBe(false);
  await other.call('HandlerBatch', { action: 'begin' }, 1);
  expect((await other.answer(1)).isError).toBe(false);
  // One owner per connection's instance.
  expect(owners).toHaveLength(2);
  const [closingOwner, otherOwner] = owners as [InstanceBatch, InstanceBatch];
  expect(closingOwner).not.toBe(otherOwner);

  await closing.call(
    'HandlerGet',
    { object_type: 'PROGRAM', program_name: 'PROG_A' },
    2,
  );
  expect(await closing.answer(2)).toEqual({ text: '', isError: false });
  await other.call(
    'HandlerGet',
    { object_type: 'PROGRAM', program_name: 'PROG_B' },
    2,
  );
  expect(await other.answer(2)).toEqual({ text: '', isError: false });
  expect(closingOwner.opened()?.recorded).toHaveLength(1);
  const signal = closingOwner.signal();

  closing.close();
  await until(() => s.standIn.logoffs() === 1);
  await until(() => closingOwner.mode() === 'off');
  expect(signal.aborted).toBe(true);
  expect(closingOwner.holdsState()).toBe(false);
  await turns(20);
  expect(envelopes()).toEqual([]);
  // The logoff is the only request after the recording.
  expect(s.standIn.requests.filter((r) => isLogoff(r.url))).toHaveLength(1);

  // The other connection's batch is still open, its call still recorded.
  expect(otherOwner.mode()).toBe('communication');
  expect(otherOwner.opened()?.recorded).toHaveLength(1);
  expect(otherOwner.signal().aborted).toBe(false);
});
