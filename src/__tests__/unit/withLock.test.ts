import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import {
  attachCleanup,
  carryCleanup,
  LockNotReleased,
  withLock,
} from '../../lib/strategies/withLock';

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
    const body = jest.fn();
    const release = jest.fn();

    const result = await withLock(
      async () => refused('Object is locked by another user'),
      body as never,
      release as never,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the acquire refusal');
    expect(result.getError().message).toBe('Object is locked by another user');
    expect(body).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it('answers the body value, releasing exactly once', async () => {
    const release = jest.fn(async () => ok(undefined));

    const result = await withLock(
      async () => ok('handle-1'),
      async () => ok('written'),
      release,
    );

    if (!result.ok) throw new Error('expected the body value');
    expect(result.getResult().value).toBe('written');
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith('handle-1');
  });

  it('releases after a refused body and answers that failure untouched', async () => {
    const release = jest.fn(async () => ok(undefined));

    const result = await withLock(
      async () => ok('handle-1'),
      async () => refused('Update refused'),
      release,
    );

    expect(release).toHaveBeenCalledTimes(1);
    if (result.ok) throw new Error('expected the body refusal');
    expect(result.getError().message).toBe('Update refused');
    expect(
      (result.getError() as { cleanup?: unknown }).cleanup,
    ).toBeUndefined();
  });

  it('releases after a THROWN body and lets the throw out unchanged', async () => {
    const release = jest.fn(async () => ok(undefined));

    await expect(
      withLock(
        async () => ok('handle-1'),
        async () => {
          throw new Error('parser blew up');
        },
        release,
      ),
    ).rejects.toThrow('parser blew up');

    // Exactly once, on the throw path as much as the others. This is the half
    // the code can promise; whether SAP then lets go is SAP's answer.
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('keeps the body failure and names the dangling lock when the release is REFUSED', async () => {
    const result = await withLock(
      async () => ok('handle-1'),
      async () => refused('Update refused'),
      async () => refused('Unlock refused'),
    );

    if (result.ok) throw new Error('expected the body refusal');
    expect(result.getError().message).toBe('Update refused');
    expect((result.getError() as { cleanup?: unknown }).cleanup).toMatchObject({
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
    );

    if (result.ok) throw new Error('expected the body refusal');
    expect(result.getError().message).toBe('Update refused');
    expect((result.getError() as { cleanup?: unknown }).cleanup).toEqual({
      error: 'client_threw',
      message: 'unlock called with no handle',
    });
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
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected the write to stand');
    expect(result.getResult().value).toBe('written');
    expect(
      (result as { cleanup?: { message?: string } }).cleanup,
    ).toMatchObject({ message: 'Unlock refused' });
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
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected the write to stand');
    const cleanup = (result as { cleanup?: { request?: unknown } }).cleanup;
    expect(cleanup?.request).toEqual({ method: 'POST', url: '/u' });
    // The rule the cleanup channel exists for: nothing reaches a caller except
    // by name, so the Authorization header cannot ride out on the lock note.
    expect(JSON.stringify(result)).not.toContain(SECRET);
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
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected the write to stand');
    expect(result.getResult().value).toBe('written');
    expect((result as { cleanup?: unknown }).cleanup).toEqual({
      error: 'client_threw',
      message: 'unlock called with no handle',
    });
  });

  it('carries the dangling lock out with a THROWN body when the release is refused', async () => {
    expect.assertions(3);
    try {
      await withLock(
        async () => ok('handle-1'),
        async () => {
          throw new Error('parser blew up');
        },
        async () => refused('Unlock refused'),
      );
    } catch (thrown) {
      const error = thrown as Error & { cause?: Error; cleanup?: unknown };
      expect(error.message).toBe('parser blew up');
      expect(error.cause?.message).toBe('parser blew up');
      expect(error.cleanup).toMatchObject({
        message: 'Unlock refused',
        origin: 'refusal',
      });
    }
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
    );

    if (result.ok) throw new Error('expected the body refusal');
    const cleanup = (result.getError() as { cleanup?: { request?: unknown } })
      .cleanup;
    expect(cleanup?.request).toEqual({ method: 'POST', url: '/u' });
    expect(JSON.stringify(result.getError())).not.toContain(SECRET);
  });
});

/**
 * The note about a lock nobody released has to reach the answer the caller
 * actually gets. In a `lock → write → unlock → activate` handler that is the
 * activation's answer, not the write's, and for a while the note stopped at
 * the write.
 */
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
    expect(carried.getResult().value).toBe('activated');
    expect((carried as { cleanup?: unknown }).cleanup).toEqual(held);
  });

  it('moves the note onto a failure without touching its error', async () => {
    const carried = await carryCleanup(withCleanup(ok('written')), async () =>
      refused('Object is locked'),
    );
    if (carried.ok) throw new Error('expected the activation refusal');
    const error = carried.getError() as IAdtError & { cleanup?: unknown };
    expect(error.message).toBe('Object is locked');
    expect(error.cleanup).toEqual(held);
  });

  /**
   * The third outcome, and the one the value-taking version of this could not
   * see: written as `carryCleanup(written, await obj.activate(…))` the await
   * ran first, so a call that threw unwound straight past the carrying. The
   * thunk is what makes this reachable at all.
   */
  it('carries the note out on a call that threw', async () => {
    const boom = new Error('socket hang up');
    await expect(
      carryCleanup(withCleanup(ok('written')), async () => {
        throw boom;
      }),
    ).rejects.toMatchObject({
      name: 'LockNotReleased',
      message: 'socket hang up',
      cleanup: held,
      cause: boom,
    });
  });

  it('lets a throw past untouched when no lock is held', async () => {
    const boom = new Error('socket hang up');
    await expect(
      carryCleanup(ok('written'), async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });

  it('hands back the call’s answer untouched when there is no note', async () => {
    const activated = ok('activated');
    expect(await carryCleanup(ok('written'), async () => activated)).toBe(
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
    expect((carried as { cleanup?: unknown }).cleanup).toEqual(own);
  });

  it('carries between two answers already in hand, for pair', () => {
    const carried = attachCleanup(withCleanup(ok('document')), ok('metadata'));
    expect((carried as { cleanup?: unknown }).cleanup).toEqual(held);
    expect(LockNotReleased.name).toBe('LockNotReleased');
  });
});
