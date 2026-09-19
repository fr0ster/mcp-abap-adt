import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { type Cleanup, safeRequest } from './safeFields';

export interface CleanupCarrier {
  cleanup?: Cleanup;
  operation?: 'succeeded';
}

const failure = <T>(
  error: IAdtError & CleanupCarrier,
): IAdtResponse<T, IAdtError> =>
  ({
    ok: false,
    getResult: () => {
      throw new Error('withLock: asked for the result of a failure');
    },
    getError: () => error,
  }) as unknown as IAdtResponse<T, IAdtError>;

/** The release, in its three states. Refused and threw are not the same event. */
type Released =
  | { kind: 'ok' }
  | { kind: 'refused'; error: IAdtError; carrier: Cleanup }
  | { kind: 'threw'; thrown: unknown; carrier: Cleanup };

async function runRelease<H>(
  release: (handle: H) => Promise<IAdtResponse<unknown, IAdtError>>,
  handle: H,
): Promise<Released> {
  let answered: IAdtResponse<unknown, IAdtError>;
  try {
    answered = await release(handle);
  } catch (error) {
    // No origin. `connection` and `refusal` are both claims about the server,
    // and neither is true of an argument-validation defect in this process.
    return {
      kind: 'threw',
      thrown: error,
      carrier: {
        error: 'client_threw',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
  if (answered.ok) return { kind: 'ok' };
  const error = answered.getError();
  return {
    kind: 'refused',
    error,
    // Narrowed here as well as at the boundary: this carrier rides inside a
    // thrown error, where it can be logged or rethrown long before `answer()`
    // renders it.
    carrier: {
      message: error.message,
      origin: error.origin,
      request: safeRequest(error.request),
    },
  };
}

/**
 * Calls around a held resource.
 *
 * NOT a `sequence`. A sequence stops at the first failure, so a refused update
 * in a lock-update-unlock chain would skip the unlock and leave the object
 * locked in SAP. `release` runs after every successful `acquire` — after a
 * refusal from `body` and after a throw from it.
 *
 * Only for a handler that owns the lock's whole lifetime. The `LockX` tools
 * hand the handle back on purpose; releasing before returning would destroy
 * them, and they are never wrapped in this.
 */
export async function withLock<H, T>(
  acquire: () => Promise<IAdtResponse<H, IAdtError>>,
  body: (handle: H) => Promise<IAdtResponse<T, IAdtError>>,
  release: (handle: H) => Promise<IAdtResponse<unknown, IAdtError>>,
): Promise<IAdtResponse<T, IAdtError>> {
  const acquired = await acquire();
  if (!acquired.ok) return acquired as unknown as IAdtResponse<T, IAdtError>;
  const handle = acquired.getResult().value;

  // Deliberately a catch rather than a `finally`. A `finally` lets the original
  // exception out as soon as the block ends, so a release that ALSO failed has
  // nowhere to go: the caller would hear about a parser defect and never about
  // the lock still held.
  let answered: IAdtResponse<T, IAdtError> | undefined;
  let thrown: unknown;
  let threw = false;
  try {
    answered = await body(handle);
  } catch (error) {
    thrown = error;
    threw = true;
  }

  const released = await runRelease(release, handle);

  if (threw) {
    if (released.kind === 'ok') throw thrown;
    throw new LockNotReleased(thrown, { cleanup: released.carrier });
  }

  const value = answered as IAdtResponse<T, IAdtError>;
  if (!value.ok) {
    if (released.kind === 'ok') return value;
    return failure<T>({ ...value.getError(), cleanup: released.carrier });
  }

  // The body succeeded, so the release's own outcome becomes the answer — in
  // its own channel. A refusal is a failure; a throw stays a throw.
  if (released.kind === 'ok') return value;
  if (released.kind === 'refused') {
    // From `released.carrier`, not `released.error` — the error is the raw
    // answer from `release`, and `error.request` has not been through
    // `safeRequest`. The carrier is narrowed once, in `runRelease`, and every
    // branch that reports a release outcome reads it from there.
    return failure<T>({
      ...released.carrier,
      operation: 'succeeded',
    } as IAdtError & CleanupCarrier);
  }
  throw new LockNotReleased(released.thrown, { operation: 'succeeded' });
}

/**
 * A throw that left a lock behind, or a release that threw after the work was
 * already done.
 *
 * Keeps the relevant cause as `cause` and borrows its message, so nothing about
 * the primary defect is reworded. Wrapping rather than attaching a property to
 * the thrown value, because a thrown value need not be an object and need not
 * be extensible.
 */
export class LockNotReleased extends Error {
  readonly cleanup?: Cleanup;
  readonly operation?: 'succeeded';
  constructor(
    cause: unknown,
    extra: { cleanup?: Cleanup; operation?: 'succeeded' },
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'LockNotReleased';
    this.cleanup = extra.cleanup;
    this.operation = extra.operation;
  }
}
