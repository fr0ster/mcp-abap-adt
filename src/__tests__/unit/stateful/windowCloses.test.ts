/**
 * RF12: a connection left stateful after its window. A read that follows a
 * tool's window on the same connection — stdio's kept one, a pooled HTTP
 * instance's — must run stateless and outside the lock's stateful context;
 * left stateful, it would run inside the old session, holding it open and
 * mixing another call into a lock's session.
 *
 * Against the stand-in, which records `x-sap-adt-sessiontype` and `Cookie`
 * per request: after an update, an activation, a lock and an unlock — also
 * when a tool is handed the legacy `session_id` / `session_state` arguments,
 * and when the `LOCK` or the `UNLOCK` is refused — the next read is stateless.
 */

import {
  carriesContext,
  isLock,
  isStateful,
  isUnlock,
  type StatefulStand,
  shown,
  statefulStand,
  toolRequests,
} from './harness';

jest.setTimeout(30_000);

const NAME = 'ZCL_PLACEHOLDER';
const SOURCE = 'CLASS zcl_placeholder DEFINITION. ENDCLASS.';
const HANDLE = 'B92E65858E83454C783181344F429D4BFD8E395D';
const LEGACY = {
  session_id: 'placeholder-session-id',
  session_state: { cookies: '', csrf_token: '' },
};

let s: StatefulStand;

beforeEach(async () => {
  s = await statefulStand([
    'UpdateClass',
    'ActivateClass',
    'ReadClass',
    'HandlerLock',
    'HandlerUnlock',
    'HandlerCheckRun',
  ]);
});

afterEach(async () => {
  await s.close();
});

/** The next read on the connection: stateless, outside any context. */
async function expectTheNextReadStateless(): Promise<void> {
  const sent = toolRequests(
    await s.during(() => s.call('ReadClass', { class_name: NAME })),
  );
  expect(sent.length).toBeGreaterThan(0);
  expect(shown(sent.filter(isStateful))).toEqual([]);
  expect(sent.some(carriesContext)).toBe(false);
}

it('after a full-binary update', async () => {
  await s.call('UpdateClass', { class_name: NAME, source_code: SOURCE });
  await expectTheNextReadStateless();
});

it('after an update whose UNLOCK is refused', async () => {
  s.standIn.answer(isUnlock, 500);
  await s.call('UpdateClass', { class_name: NAME, source_code: SOURCE });
  await expectTheNextReadStateless();
});

it('after an update whose LOCK is refused', async () => {
  s.standIn.answer(isLock, 403);
  await s.call('UpdateClass', { class_name: NAME, source_code: SOURCE });
  await expectTheNextReadStateless();
});

it('after an activation', async () => {
  await s.call('ActivateClass', { class_name: NAME });
  await expectTheNextReadStateless();
});

it('after an activation handed the legacy session arguments', async () => {
  await s.call('ActivateClass', { class_name: NAME, ...LEGACY });
  await expectTheNextReadStateless();
});

it("after compact's HandlerLock, also handed the legacy session arguments", async () => {
  await s.call('HandlerLock', {
    object_type: 'CLASS',
    object_name: NAME,
    ...LEGACY,
  });
  await expectTheNextReadStateless();
});

it("after compact's HandlerUnlock, also handed the legacy session arguments", async () => {
  await s.call('HandlerLock', { object_type: 'CLASS', object_name: NAME });
  await s.call('HandlerUnlock', {
    object_type: 'CLASS',
    object_name: NAME,
    lock_handle: HANDLE,
    ...LEGACY,
  });
  await expectTheNextReadStateless();
});

it('after a check handed the legacy session arguments', async () => {
  await s.call('HandlerCheckRun', {
    object_type: 'CLASS',
    object_name: NAME,
    ...LEGACY,
  });
  await expectTheNextReadStateless();
});
