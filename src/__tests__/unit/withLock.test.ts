import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import {
  attachCleanup,
  carryCleanup,
  LOCK_WENT_WITH_SESSION_WORDS,
  LockNotReleased,
  withLock,
} from '../../lib/strategies/withLock';
import {
  assertMatchObject,
  assertRejects,
  rejectionOf,
} from '../helpers/assertions';

/** What every lock here is taken on. */
const OBJECT = { type: 'CLASS', name: 'OBJ' };

/** What a failed release of `handle-1` on OBJECT adds, for the given reason. */
const leftLockedBy = (reason: string) => ({
  left_locked: true,
  lock_handle: 'handle-1',
  object: { type: 'CLASS', name: 'OBJ' },
  warning: `the object may be left locked: the unlock failed (${reason}); it is released when the SAP session ends (logoff) or by its owner`,
});

function ok<T>(value: T): IAdtResponse<T, IAdtError> {
  return {
    ok: true,
    getResult: () => ({ value }),
    getError: () => {
      throw new Error('not a failure');
    },
  } as unknown as IAdtResponse<T, IAdtError>;
}

function refused(
  message: string,
  request?: unknown,
): IAdtResponse<never, IAdtError> {
  return {
    ok: false,
    getResult: () => {
      throw new Error('not a success');
    },
    getError: () => ({ origin: 'refusal', message, request }),
  } as unknown as IAdtResponse<never, IAdtError>;
}

describe('withLock', () => {
  it('runs neither body nor release when the lock is refused', async () => {
    const body = mock.fn();
    const release = mock.fn();

    const result = await withLock(
      async () => refused('Object is locked by another user'),
      body as never,
      release as never,
      OBJECT,
    );

    assert.equal(result.ok, false);
    if (result.ok) throw new Error('expected the acquire refusal');
    assert.equal(result.getError().message, 'Object is locked by another user');
    assert.equal(body.mock.callCount(), 0);
    assert.equal(release.mock.callCount(), 0);
  });

  it('answers the body value, releasing exactly once', async () => {
    const release = mock.fn(async () => ok(undefined));

    const result = await withLock(
      async () => ok('handle-1'),
      async () => ok('written'),
      release,
      OBJECT,
    );

    if (!result.ok) throw new Error('expected the body value');
    assert.equal(result.getResult().value, 'written');
    assert.equal(release.mock.callCount(), 1);
    assert.ok(
      release.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, ['handle-1']),
      ),
    );
  });

  it('releases after a refused body and answers that failure untouched', async () => {
    const release = mock.fn(async () => ok(undefined));

    const result = await withLock(
      async () => ok('handle-1'),
      async () => refused('Update refused'),
      release,
      OBJECT,
    );

    assert.equal(release.mock.callCount(), 1);
    if (result.ok) throw new Error('expected the body refusal');
    assert.equal(result.getError().message, 'Update refused');
    assert.equal(
      (result.getError() as { cleanup?: unknown }).cleanup,
      undefined,
    );
  });

  it('releases after a THROWN body and lets the throw out unchanged', async () => {
    const release = mock.fn(async () => ok(undefined));

    await assertRejects(
      withLock(
        async () => ok('handle-1'),
        async () => {
          throw new Error('parser blew up');
        },
        release,
        OBJECT,
      ),
      'parser blew up',
    );

    // Exactly once, on the throw path as much as the others. This is the half
    // the code can promise; whether SAP then lets go is SAP's answer.
    assert.equal(release.mock.callCount(), 1);
  });

  it('keeps the body failure and names the dangling lock when the release is REFUSED', async () => {
    const result = await withLock(
      async () => ok('handle-1'),
      async () => refused('Update refused'),
      async () => refused('Unlock refused'),
      OBJECT,
    );

    if (result.ok) throw new Error('expected the body refusal');
    assert.equal(result.getError().message, 'Update refused');
    assertMatchObject((result.getError() as { cleanup?: unknown }).cleanup, {
      message: 'Unlock refused',
      origin: 'refusal',
    });
  });

  it('marks a THROWN release as client_threw, with no origin, after a refused body', async () => {
    const result = await withLock(
      async () => ok('handle-1'),
      async () => refused('Update refused'),
      async () => {
        throw new Error('unlock called with no handle');
      },
      OBJECT,
    );

    if (result.ok) throw new Error('expected the body refusal');
    assert.equal(result.getError().message, 'Update refused');
    assert.deepStrictEqual(
      (result.getError() as { cleanup?: unknown }).cleanup,
      {
        error: 'client_threw',
        message: 'unlock called with no handle',
        failures: [
          {
            error: 'client_threw',
            message: 'unlock called with no handle',
            step: 'unlock',
          },
        ],
        ...leftLockedBy('unlock called with no handle'),
      },
    );
  });

  /**
   * A write that landed is not a failed call.
   *
   * This asserted the opposite for a while: a refused unlock turned the whole
   * operation into a failure, with `operation: 'succeeded'` inside the error
   * payload for whoever thought to look. That is a regression against the
   * pre-migration handlers — `handleUpdateClass` caught a refused unlock,
   * `logger.warn`'d it and carried on — and it told a caller their write had
   * failed when it had not.
   *
   * What the old code DID lose is the lock: the warning went to a log nobody
   * reads. So the result is the body's, and the dangling lock rides along as
   * `cleanup`.
   */
  it('answers the write, and carries the dangling lock, under a REFUSED unlock', async () => {
    const result = await withLock(
      async () => ok('handle-1'),
      async () => ok('written'),
      async () => refused('Unlock refused'),
      OBJECT,
    );

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error('expected the write to stand');
    assert.equal(result.getResult().value, 'written');
    assertMatchObject((result as { cleanup?: { message?: string } }).cleanup, {
      message: 'Unlock refused',
    });
  });

  it('never puts a transport config in a succeeded write under a REFUSED unlock', async () => {
    const SECRET = 'Bearer eyJhbGciOiJIUzI1NiJ9.tolkien';

    const result = await withLock(
      async () => ok('handle-1'),
      async () => ok('written'),
      async () =>
        refused('Unlock refused', {
          method: 'POST',
          url: '/u',
          headers: { authorization: SECRET },
        }),
      OBJECT,
    );

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error('expected the write to stand');
    const cleanup = (result as { cleanup?: { request?: unknown } }).cleanup;
    assert.deepStrictEqual(cleanup?.request, { method: 'POST', url: '/u' });
    // The rule the cleanup channel exists for: nothing reaches a caller except
    // by name, so the Authorization header cannot ride out on the lock note.
    assert.ok(!JSON.stringify(result).includes(SECRET));
  });

  /**
   * Same rule when the release throws rather than refusing: the body's answer
   * stands, and what the release did is reported beside it. This used to
   * rethrow, which made a landed write reach the caller as an exception.
   */
  it('answers the write when the release THROWS, naming what threw', async () => {
    const result = await withLock(
      async () => ok('handle-1'),
      async () => ok('written'),
      async () => {
        throw new Error('unlock called with no handle');
      },
      OBJECT,
    );

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error('expected the write to stand');
    assert.equal(result.getResult().value, 'written');
    assert.deepStrictEqual((result as { cleanup?: unknown }).cleanup, {
      error: 'client_threw',
      message: 'unlock called with no handle',
      failures: [
        {
          error: 'client_threw',
          message: 'unlock called with no handle',
          step: 'unlock',
        },
      ],
      ...leftLockedBy('unlock called with no handle'),
    });
  });

  it('carries the dangling lock out with a THROWN body when the release is refused', async () => {
    // expect.assertions(3): the three checks of the catch, counted.
    let checked = 0;
    try {
      await withLock(
        async () => ok('handle-1'),
        async () => {
          throw new Error('parser blew up');
        },
        async () => refused('Unlock refused'),
        OBJECT,
      );
    } catch (thrown) {
      const error = thrown as Error & { cause?: Error; cleanup?: unknown };
      assert.equal(error.message, 'parser blew up');
      checked += 1;
      assert.equal(error.cause?.message, 'parser blew up');
      checked += 1;
      assertMatchObject(error.cleanup, {
        message: 'Unlock refused',
        origin: 'refusal',
      });
      checked += 1;
    }
    assert.equal(checked, 3);
  });

  it('never puts a transport config in the carrier, even before the boundary', async () => {
    const SECRET = 'Bearer eyJhbGciOiJIUzI1NiJ9.tolkien';

    const result = await withLock(
      async () => ok('handle-1'),
      async () => refused('Update refused'),
      async () =>
        refused('Unlock refused', {
          method: 'POST',
          url: '/u',
          headers: { authorization: SECRET },
        }),
      OBJECT,
    );

    if (result.ok) throw new Error('expected the body refusal');
    const cleanup = (result.getError() as { cleanup?: { request?: unknown } })
      .cleanup;
    assert.deepStrictEqual(cleanup?.request, { method: 'POST', url: '/u' });
    assert.ok(!JSON.stringify(result.getError()).includes(SECRET));
  });
});

/**
 * The note about a lock nobody released has to reach the answer the caller
 * actually gets. In a `lock → write → unlock → activate` handler that is the
 * activation's answer, not the write's, and for a while the note stopped at
 * the write.
 */
// A release on a spent connection (the owner's decision), read from the typed
// verdict alone: the lock went with its SAP session, so the carrier says so
// instead of `left_locked` and the handle.
describe('withLock, a release on a spent connection', () => {
  const spentRelease = (extra: Partial<IAdtError>) => async () =>
    ({
      ok: false,
      getResult: () => {
        throw new Error('not a success');
      },
      getError: () => ({
        origin: 'connection',
        message: 'words that are never read',
        ...extra,
      }),
    }) as unknown as IAdtResponse<never, IAdtError>;

  for (const [_name, extra] of [
    ['sessionError ADT_NOT_CONNECTED', { sessionError: 'ADT_NOT_CONNECTED' }],
    [
      'sessionError ADT_SESSION_REPLACED',
      { sessionError: 'ADT_SESSION_REPLACED' },
    ],
    ['sessionLost', { sessionLost: 'ADT_SESSION_REPLACED' }],
  ] as const) {
    it(
      format(
        '%s: the lock went with the session — no left_locked, no handle',
        _name,
      ),
      async () => {
        const result = await withLock(
          async () => ok('handle-1'),
          async () => ok('written'),
          spentRelease(extra),
          OBJECT,
        );
        // Read before the check below, which narrows `result` to a success.
        const cleanup = (result as { cleanup?: Record<string, unknown> })
          .cleanup;
        assert.equal(result.ok, true);
        assert.equal(cleanup?.left_locked, undefined);
        assert.equal(cleanup?.lock_handle, undefined);
        assert.deepStrictEqual(cleanup?.object, { type: 'CLASS', name: 'OBJ' });
        assert.equal(cleanup?.warning, LOCK_WENT_WITH_SESSION_WORDS);
      },
    );
  }

  it('ADT_RELEASE_PENDING is no spent connection: the lock may be left locked', async () => {
    const result = await withLock(
      async () => ok('handle-1'),
      async () => ok('written'),
      spentRelease({ sessionError: 'ADT_RELEASE_PENDING' }),
      OBJECT,
    );
    const cleanup = (result as { cleanup?: Record<string, unknown> }).cleanup;
    assertMatchObject(cleanup, leftLockedBy('words that are never read'));
  });
});

describe('carryCleanup', () => {
  const held = { message: 'Unlock refused', origin: 'refusal' as const };

  const withCleanup = <T>(
    answer: IAdtResponse<T, IAdtError>,
  ): IAdtResponse<T, IAdtError> =>
    ({ ...answer, cleanup: held }) as unknown as IAdtResponse<T, IAdtError>;

  it('moves the note onto a success', async () => {
    const carried = await carryCleanup(withCleanup(ok('written')), async () =>
      ok('activated'),
    );
    if (!carried.ok) throw new Error('expected the activation to stand');
    assert.equal(carried.getResult().value, 'activated');
    assert.deepStrictEqual((carried as { cleanup?: unknown }).cleanup, held);
  });

  it('moves the note onto a failure without touching its error', async () => {
    const carried = await carryCleanup(withCleanup(ok('written')), async () =>
      refused('Object is locked'),
    );
    if (carried.ok) throw new Error('expected the activation refusal');
    const error = carried.getError() as IAdtError & { cleanup?: unknown };
    assert.equal(error.message, 'Object is locked');
    assert.deepStrictEqual(error.cleanup, held);
  });

  /**
   * The third outcome, and the one the value-taking version of this could not
   * see: written as `carryCleanup(written, await obj.activate(…))` the await
   * ran first, so a call that threw unwound straight past the carrying. The
   * thunk is what makes this reachable at all.
   */
  it('carries the note out on a call that threw', async () => {
    const boom = new Error('socket hang up');
    assertMatchObject(
      await rejectionOf(
        carryCleanup(withCleanup(ok('written')), async () => {
          throw boom;
        }),
      ),
      {
        name: 'LockNotReleased',
        message: 'socket hang up',
        cleanup: held,
        cause: boom,
      },
    );
  });

  it('lets a throw past untouched when no lock is held', async () => {
    const boom = new Error('socket hang up');
    assert.equal(
      await rejectionOf(
        carryCleanup(ok('written'), async () => {
          throw boom;
        }),
      ),
      boom,
    );
  });

  it('hands back the call’s answer untouched when there is no note', async () => {
    const activated = ok('activated');
    assert.equal(
      await carryCleanup(ok('written'), async () => activated),
      activated,
    );
  });

  it('does not overwrite a note the answer already carries', async () => {
    const own = { message: 'Its own cleanup', origin: 'refusal' as const };
    const activated = {
      ...ok('activated'),
      cleanup: own,
    } as unknown as IAdtResponse<string, IAdtError>;
    const carried = await carryCleanup(
      withCleanup(ok('written')),
      async () => activated,
    );
    assert.deepStrictEqual((carried as { cleanup?: unknown }).cleanup, own);
  });

  it('carries between two answers already in hand, for pair', () => {
    const carried = attachCleanup(withCleanup(ok('document')), ok('metadata'));
    assert.deepStrictEqual((carried as { cleanup?: unknown }).cleanup, held);
    assert.equal(LockNotReleased.name, 'LockNotReleased');
  });
});
