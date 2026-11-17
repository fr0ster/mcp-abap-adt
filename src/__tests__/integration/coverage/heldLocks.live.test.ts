/**
 * Held locks, live (plan D9, #4): a write, a delete or an unlock under a
 * `lock_handle` is sent only under a handle this instance's `HandlerLock`
 * issued.
 *
 * Measured before the fix (on premise, 2026-11-04): in a stateful session
 * holding a class's lock, SAP answered `200` to an `UNLOCK` naming an
 * invented handle and released the lock; on stdio and SSE the server passed
 * any handle on. The test creates a class, locks it through `HandlerLock`,
 * and checks that every lock tool refuses a handle the instance did not
 * issue, writing nothing (read back), while the handle the
 * lock issued writes (read back), deletes an include and unlocks — once.
 *
 * The calls go through `livePrepare`: the keys these paths stand for are
 * pinned and covered live by their family tasks; this file proves the
 * held-lock check on both systems. The class's name is read free before its
 * create and recorded for cleanup before it; it is deleted after and read
 * absent.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, it } from 'node:test';
import {
  configuredSystemKind,
  resolvePackageName,
  resolveTransportRequest,
} from '../helpers/configHelpers';
import {
  deleteRecorded,
  expectAbsent,
  expectNameFree,
  type LiveAnswer,
  livePrepare,
  liveSuite,
  recordCreated,
} from '../helpers/live';
import { assertEquals } from '../helpers/liveAssert';

const SUFFIX = randomBytes(2).toString('hex').toUpperCase();
const CLASS = `ZMCP_HL${SUFFIX}`;
/** A handle no lock issued. */
const FOREIGN = `F0REIGN${SUFFIX}000000000000000000000000000000`;
const NOT_HELD = 'lock_handle is not held by this instance';

const OWN = 'lv_own';
const OTHER = 'lv_other';

/** The class's source, declaring the attribute `marker`. */
const sourceWith = (marker: string): string =>
  [
    `CLASS ${CLASS.toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
    '  PUBLIC SECTION.',
    `    DATA ${marker} TYPE i.`,
    'ENDCLASS.',
    `CLASS ${CLASS.toLowerCase()} IMPLEMENTATION.`,
    'ENDCLASS.',
  ].join('\n');

/** `$TMP` on premise; the configured package on the cloud, which has none. */
const packageName = (): string =>
  configuredSystemKind() === 'onprem' ? '$TMP' : resolvePackageName();

/** The configured request on the cloud; none on premise (`$TMP`). */
function onRequest(): { transport_request?: string } {
  if (configuredSystemKind() === 'onprem') return {};
  const request = resolveTransportRequest();
  return request === undefined || request === ''
    ? {}
    : { transport_request: request };
}

/** The answer, or the case fails naming the step and what was answered. */
function succeeded(step: string, answer: LiveAnswer): LiveAnswer {
  if (answer.isError) throw new Error(`${step}: ${answer.text}`);
  return answer;
}

/** The refusal of a handle the instance does not hold. */
function expectNotHeld(step: string, answer: LiveAnswer): void {
  assertEquals({ step, isError: answer.isError }, { step, isError: true });
  assertEquals(
    { step, refused: answer.text.includes(NOT_HELD) },
    {
      step,
      refused: true,
    },
  );
}

/** A member of a JSON value, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** Locks the class through `HandlerLock`: the handle it issued. */
async function lockClass(): Promise<string> {
  const locked = succeeded(
    'HandlerLock',
    await livePrepare('HandlerLock', {
      object_type: 'CLASS',
      object_name: CLASS,
    }),
  );
  const handle = member(JSON.parse(locked.text), 'lock_handle');
  if (typeof handle !== 'string' || handle === '') {
    throw new Error(`HandlerLock answered no handle: ${locked.text}`);
  }
  return handle;
}

/** The markers the class's inactive source declares, of those the test writes. */
async function markers(): Promise<string[]> {
  const read = succeeded(
    'GetClass inactive',
    await livePrepare('GetClass', { class_name: CLASS, version: 'inactive' }),
  );
  return [OWN, OTHER].filter((marker) =>
    read.text.includes(`DATA ${marker} TYPE i.`),
  );
}

const unlockArgs = (lock_handle: string) => ({
  object_type: 'CLASS',
  object_name: CLASS,
  lock_handle,
});

liveSuite(['onprem', 'cloud'], 'held locks', () => {
  before(async () => {
    await expectNameFree({ tool: 'GetClass', args: { class_name: CLASS } });
    recordCreated('DeleteClass', { class_name: CLASS, ...onRequest() });
    succeeded(
      'CreateClass',
      await livePrepare('CreateClass', {
        class_name: CLASS,
        package_name: packageName(),
        description: 'MCP held lock live case',
        ...onRequest(),
      }),
    );
  });

  after(async () => {
    await deleteRecorded();
    await expectAbsent({ tool: 'GetClass', args: { class_name: CLASS } });
  });

  it('under a handle the instance did not issue every tool is refused and nothing is written; under the issued one the write, the include delete and the unlock go, and a second unlock is refused', async () => {
    const handle = await lockClass();
    try {
      expectNotHeld(
        'HandlerUpdate foreign',
        await livePrepare('HandlerUpdate', {
          object_type: 'CLASS',
          class_name: CLASS,
          source_code: sourceWith(OTHER),
          lock_handle: FOREIGN,
          ...onRequest(),
        }),
      );
      expectNotHeld(
        'HandlerDelete foreign',
        await livePrepare('HandlerDelete', {
          object_type: 'LOCAL_TYPES',
          class_name: CLASS,
          lock_handle: FOREIGN,
          ...onRequest(),
        }),
      );
      expectNotHeld(
        'HandlerUnlock foreign',
        await livePrepare('HandlerUnlock', unlockArgs(FOREIGN)),
      );
      assertEquals(await markers(), []);

      // The lock lives on after the refused unlock: the write under the
      // issued handle goes.
      succeeded(
        'HandlerUpdate own',
        await livePrepare('HandlerUpdate', {
          object_type: 'CLASS',
          class_name: CLASS,
          source_code: sourceWith(OWN),
          lock_handle: handle,
          ...onRequest(),
        }),
      );
      assertEquals(await markers(), [OWN]);
      succeeded(
        'HandlerDelete own',
        await livePrepare('HandlerDelete', {
          object_type: 'LOCAL_TYPES',
          class_name: CLASS,
          lock_handle: handle,
          ...onRequest(),
        }),
      );
    } finally {
      succeeded(
        'HandlerUnlock own',
        await livePrepare('HandlerUnlock', unlockArgs(handle)),
      );
    }
    expectNotHeld(
      'HandlerUnlock own again',
      await livePrepare('HandlerUnlock', unlockArgs(handle)),
    );
  });
});
