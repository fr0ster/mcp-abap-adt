/**
 * The idle bound on an SSE instance that holds a lock (#4, review round 1):
 * the bound's stop lets go of the lock's handle, so it logs the instance's
 * SAP session off — the logoff releases the lock in SAP (measured). Without
 * it the lock outlived its handle: no unlock could reach it until the
 * stream closed. The instance lives on, and its next call logs on afresh.
 *
 * The bound's timer is the idle mechanism's own `setTimeout`: a timeout of a
 * minute or more is the bound's (nothing else on this path waits that long)
 * and is run here by `expire()`; every other timer is the real one.
 */
import { CompactModifyHandlersGroup } from '@mcp-abap-adt/compact-modify';
import { noConnectionContext } from '@mcp-abap-adt/lib/handlers';
import { isLogoff } from '../../../../src/__tests__/helpers/adtStandIn';
import { type SseStand, sseStand, turns, until } from './shutdown/harness';

jest.setTimeout(30_000);

const MINUTE = 60_000;

let s: SseStand;
/** The bound's callbacks, armed and not cleared. */
let bound: Array<{ run: () => void; timer: ReturnType<typeof setTimeout> }>;

const realSetTimeout = global.setTimeout;
const realClearTimeout = global.clearTimeout;

beforeEach(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  bound = [];
  jest
    .spyOn(global, 'setTimeout')
    .mockImplementation((callback, ms, ...rest) => {
      if (typeof ms === 'number' && ms >= MINUTE) {
        // The bound's own timer stays armed, never firing on its own.
        const timer = realSetTimeout(() => {}, ms);
        timer.unref();
        bound.push({ run: () => callback(...rest), timer });
        return timer;
      }
      return realSetTimeout(callback, ms, ...rest);
    });
  jest.spyOn(global, 'clearTimeout').mockImplementation((timer) => {
    bound = bound.filter((each) => each.timer !== timer);
    realClearTimeout(timer);
  });
  s = await sseStand({
    server: { stateIdleMinutes: 30 },
    groups: [new CompactModifyHandlersGroup(noConnectionContext())],
  });
});

afterEach(async () => {
  jest.restoreAllMocks();
  await s.close();
});

/** Runs the bound's last armed timer: its 30 minutes have passed. */
function expire(): void {
  const last = bound.pop();
  if (last === undefined) throw new Error('no idle bound is armed');
  realClearTimeout(last.timer);
  last.run();
}

const logoffs = () => s.standIn.requests.filter((r) => isLogoff(r.url)).length;

it('the idle bound of an SSE instance holding a lock logs its session off; the next call logs on afresh', async () => {
  const connection = await s.open();
  await connection.call(
    'HandlerLock',
    { object_type: 'CLASS', object_name: 'ZCL_IDLE' },
    1,
  );
  const locked = await connection.answer(1);
  expect(locked.isError).toBe(false);
  await turns(20);
  expect(logoffs()).toBe(0);

  expire();
  await until(() => logoffs() === 1);

  // The handle went with the session: an unlock under it is refused, no
  // UNLOCK sent (the call's own logon on the new session goes first).
  const before = s.standIn.requests.length;
  await connection.call(
    'HandlerUnlock',
    {
      object_type: 'CLASS',
      object_name: 'ZCL_IDLE',
      lock_handle: 'B92E65858E83454C783181344F429D4BFD8E395D',
    },
    2,
  );
  const unlocked = await connection.answer(2);
  expect(unlocked.isError).toBe(true);
  expect(
    s.standIn.requests
      .slice(before)
      .filter((r) => r.url.includes('_action=UNLOCK')),
  ).toEqual([]);

  await connection.call(
    'HandlerLock',
    { object_type: 'CLASS', object_name: 'ZCL_IDLE' },
    3,
  );
  expect((await connection.answer(3)).isError).toBe(false);
  expect(
    s.standIn.requests
      .slice(before)
      .some((r) => r.url.includes('_action=LOCK')),
  ).toBe(true);
});

it('the idle bound of an SSE instance holding nothing it lets go of keeps the session', async () => {
  const connection = await s.open();
  await connection.call(
    'HandlerLock',
    { object_type: 'CLASS', object_name: 'ZCL_IDLE' },
    1,
  );
  expect((await connection.answer(1)).isError).toBe(false);
  await connection.call(
    'HandlerUnlock',
    {
      object_type: 'CLASS',
      object_name: 'ZCL_IDLE',
      lock_handle: 'B92E65858E83454C783181344F429D4BFD8E395D',
    },
    2,
  );
  expect((await connection.answer(2)).isError).toBe(false);
  await turns(20);
  // Nothing held: no bound is armed, and the session stays.
  expect(bound).toEqual([]);
  expect(logoffs()).toBe(0);
});
