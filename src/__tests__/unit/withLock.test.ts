import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { withLock } from '../../lib/strategies/withLock';

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

  it('reports a succeeded write under a REFUSED unlock as a failure', async () => {
    const result = await withLock(
      async () => ok('handle-1'),
      async () => ok('written'),
      async () => refused('Unlock refused'),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the release refusal');
    expect(result.getError().message).toBe('Unlock refused');
    expect(result.getError().origin).toBe('refusal');
    expect((result.getError() as { operation?: unknown }).operation).toBe(
      'succeeded',
    );
  });

  it('rethrows a THROWN release after a successful body rather than inventing an origin', async () => {
    expect.assertions(3);
    try {
      await withLock(
        async () => ok('handle-1'),
        async () => ok('written'),
        async () => {
          throw new Error('unlock called with no handle');
        },
      );
    } catch (thrown) {
      const error = thrown as Error & {
        operation?: unknown;
        cleanup?: unknown;
      };
      // A throw stays a throw. Turning it into an IAdtResponse failure would
      // mean giving it an AdtFailureOrigin it does not have.
      expect(error.message).toBe('unlock called with no handle');
      expect(error.operation).toBe('succeeded');
      expect(error.cleanup).toBeUndefined();
    }
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
