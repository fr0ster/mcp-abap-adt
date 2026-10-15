/**
 * The stateful window: a tool's session is stateful
 * only for the lock and the unlock — and nothing else of a tool's goes
 * stateful. Against the stand-in, which records each request's
 * `x-sap-adt-sessiontype` and `Cookie`, on one shared connection:
 *
 * - a full-binary update sends its `LOCK` and its `UNLOCK` stateful, the
 *   write under the lock stateless and outside the lock's context (as
 *   Eclipse does; the lock handle carries it) — and nothing else stateful;
 * - an activation runs as adt-clients sends it: stateless (adt-clients 31.1
 *   opens no window for it; the server adds none of its own);
 * - a read, a search, a run and a where-used are stateless;
 * - compact's `HandlerLock` leaves the window open until `HandlerUnlock` —
 *   the consumer's choice: the calls between are stateless and outside the
 *   lock's context, the `UNLOCK` reaches it; the instance's logoff ends it.
 */

import {
  carriesContext,
  isActivation,
  isLock,
  isStateful,
  isUnlock,
  type StatefulStand,
  shown,
  statefulStand,
  toolRequests,
} from './harness';

jest.setTimeout(30_000);

async function until(done: () => boolean, limitMs = 10_000): Promise<void> {
  const end = Date.now() + limitMs;
  while (!done()) {
    if (Date.now() > end) throw new Error('the condition never held');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

const NAME = 'ZCL_PLACEHOLDER';
const SOURCE = 'CLASS zcl_placeholder DEFINITION. ENDCLASS.';

let s: StatefulStand;

beforeEach(async () => {
  s = await statefulStand([
    'UpdateClass',
    'ActivateClass',
    'ReadClass',
    'GetClass',
    'SearchObject',
    'GetWhereUsed',
    'RuntimeRunClass',
    'HandlerLock',
    'HandlerUnlock',
  ]);
});

afterEach(async () => {
  await s.close();
});

it('a full-binary update: LOCK and UNLOCK stateful, the write and the rest stateless', async () => {
  const sent = toolRequests(
    await s.during(() =>
      s.call('UpdateClass', { class_name: NAME, source_code: SOURCE }),
    ),
  );
  const lock = sent.filter(isLock);
  const unlock = sent.filter(isUnlock);
  const write = sent.filter((r) => r.method === 'PUT');
  expect(lock).toHaveLength(1);
  expect(unlock).toHaveLength(1);
  expect(write).toHaveLength(1);
  expect(lock.every(isStateful)).toBe(true);
  expect(unlock.every(isStateful)).toBe(true);
  // The UNLOCK reaches the context the LOCK opened; the write runs outside it.
  expect(unlock.every(carriesContext)).toBe(true);
  expect(write.some(isStateful)).toBe(false);
  expect(write.some(carriesContext)).toBe(false);
  // Every other request of the tool: stateless.
  const others = sent.filter((r) => !isLock(r) && !isUnlock(r));
  expect(shown(others.filter(isStateful))).toEqual([]);
  // One ABAP session: the LOCK's.
  expect(new Set(sent.map((r) => r.session)).size).toBe(1);
});

it('an activation: sent as adt-clients sends it, stateless, with no window of the server', async () => {
  const sent = toolRequests(
    await s.during(() => s.call('ActivateClass', { class_name: NAME })),
  );
  const activation = sent.filter(isActivation);
  expect(activation).toHaveLength(1);
  expect(shown(sent.filter(isStateful))).toEqual([]);
  expect(sent.some(carriesContext)).toBe(false);
});

it.each([
  ['a read (ReadClass)', 'ReadClass', { class_name: NAME }],
  ['a read (GetClass)', 'GetClass', { class_name: NAME }],
  ['a search', 'SearchObject', { object_name: 'ZCL*' }],
  ['a run', 'RuntimeRunClass', { class_name: NAME }],
  ['a where-used', 'GetWhereUsed', { object_name: NAME, object_type: 'class' }],
])('%s: every request stateless', async (_label, tool, args) => {
  const sent = toolRequests(await s.during(() => s.call(tool, args)));
  expect(sent.length).toBeGreaterThan(0);
  expect(shown(sent.filter(isStateful))).toEqual([]);
  expect(sent.some(carriesContext)).toBe(false);
});

it("compact's HandlerLock leaves the window open until HandlerUnlock: the calls between are stateless", async () => {
  const locked = toolRequests(
    await s.during(() =>
      s.call('HandlerLock', { object_type: 'CLASS', object_name: NAME }),
    ),
  );
  expect(locked.filter(isLock)).toHaveLength(1);
  expect(locked.filter(isLock).every(isStateful)).toBe(true);
  const lockSession = locked.filter(isLock)[0]?.session;

  const between = toolRequests(
    await s.during(async () => {
      await s.call('ReadClass', { class_name: NAME });
      await s.call('SearchObject', { object_name: 'ZCL*' });
    }),
  );
  expect(shown(between.filter(isStateful))).toEqual([]);
  expect(between.some(carriesContext)).toBe(false);

  const unlocked = toolRequests(
    await s.during(() =>
      s.call('HandlerUnlock', {
        object_type: 'CLASS',
        object_name: NAME,
        lock_handle: 'B92E65858E83454C783181344F429D4BFD8E395D',
      }),
    ),
  );
  const unlock = unlocked.filter(isUnlock);
  expect(unlock).toHaveLength(1);
  expect(unlock.every(isStateful)).toBe(true);
  // The UNLOCK reaches the context the LOCK opened, in the LOCK's session.
  expect(unlock.every(carriesContext)).toBe(true);
  expect(unlock[0]?.session).toBe(lockSession);
});

it("compact's HandlerLock without HandlerUnlock: the instance's logoff ends the window", async () => {
  const locked = toolRequests(
    await s.during(() =>
      s.call('HandlerLock', { object_type: 'CLASS', object_name: NAME }),
    ),
  );
  const lockSession = locked.filter(isLock)[0]?.session;
  expect(lockSession).toBeDefined();
  expect(s.standIn.loggedOff()).not.toContain(lockSession);
  // `disconnect()` resolves once the logoff is written: wait for its arrival.
  await s.logoff();
  await until(() => s.standIn.loggedOff().includes(lockSession as string));
  expect(s.standIn.loggedOff()).toEqual([lockSession]);
});
