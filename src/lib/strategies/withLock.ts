import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
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

  // **The body succeeded, so the call succeeded.** A release that failed
  // afterwards is reported beside the result, never instead of it.
  //
  // This answered a failure for a while — the write had landed, and the tool
  // said the call had failed, with `operation: 'succeeded'` buried in the
  // payload for whoever thought to read it. That is a regression against what
  // these handlers did before the migration, where a refused unlock was
  // caught and `logger.warn`'d and the update still answered success
  // (`handleUpdateClass`, pre-19: "Failed to unlock class …" on the warn
  // channel, then on to activate). A caller who asked to write, and whose
  // write is on the server, has not had a failure.
  //
  // What must not be lost is the lock: it is still held, and the caller is
  // the only one who can do anything about it. So it travels on the success
  // answer as `cleanup`, the same shape `answer()` already renders on the
  // failure path, rather than being dropped.
  if (released.kind === 'ok') return value;
  if (released.kind === 'refused') {
    return succeededWithCleanup(value, { cleanup: released.carrier });
  }
  return succeededWithCleanup(value, {
    cleanup: { error: 'client_threw', message: messageOf(released.thrown) },
  });
}

/**
 * The body's own answer, carrying what the release left behind.
 *
 * `getResult()` is preserved rather than rebuilt: the value is whatever the
 * result strategy made, and this has no business reshaping it. Only the
 * cleanup note is added, on a property `answer()` knows how to render.
 */
function succeededWithCleanup<T>(
  value: IAdtResponse<T, IAdtError>,
  carrier: CleanupCarrier,
): IAdtResponse<T, IAdtError> {
  if (!value.ok) return value;
  const result = value.getResult();
  return {
    ok: true,
    getResult: () => result,
    getError: () => {
      throw new Error('withLock: asked for the error of a success');
    },
    cleanup: carrier.cleanup,
  } as unknown as IAdtResponse<T, IAdtError>;
}

function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
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

/**
 * Carries a held lock across the call that follows the locked work.
 *
 * `withLock` answers the body's own result and hangs the note about an
 * unreleased lock on it as `cleanup`. That note only reaches the caller if the
 * answer it rides on is the one returned — and in every `lock → write →
 * unlock → activate` handler it is not: the write's answer is checked for
 * `ok`, then discarded in favour of the activation's. The lock disappeared
 * exactly where it matters most, since a write that could not be unlocked is
 * also a write whose activation is likely to fail on that same lock.
 *
 * **It owns the call rather than taking its answer**, because a call has three
 * outcomes and only two of them are an answer. Written as
 * `carryCleanup(written, await obj.activate(…))` the await runs first, so an
 * activation that *threw* — a broken connection, a parser defect — unwound
 * straight past the carrying and the lock was lost on the one path where the
 * caller can least afford to lose it. Taking a thunk closes that: the throw is
 * caught here, wrapped in a `LockNotReleased` that keeps the original as its
 * `cause` and its message, and `answer()` renders the note off the thrown
 * object exactly as it does off a refusal.
 *
 * Nothing else about either outcome changes: a failed call keeps its own error
 * and gains a `cleanup` field, a successful one keeps its result. An answer
 * that already carries a cleanup of its own keeps it — this only fills a gap.
 */
export async function carryCleanup<T, U>(
  from: IAdtResponse<T, IAdtError>,
  next: () => Promise<IAdtResponse<U, IAdtError>>,
): Promise<IAdtResponse<U, IAdtError>> {
  const cleanup = (from as unknown as CleanupCarrier).cleanup;
  let answered: IAdtResponse<U, IAdtError>;
  try {
    answered = await next();
  } catch (error) {
    if (cleanup === undefined) throw error;
    throw new LockNotReleased(error, { cleanup });
  }
  return attachCleanup(from, answered);
}

/**
 * The same carrying between two answers already in hand, for the combinators
 * that have no call left to make — `pair`, building its tuple from scratch.
 */
export function attachCleanup<T, U>(
  from: IAdtResponse<T, IAdtError>,
  onto: IAdtResponse<U, IAdtError>,
): IAdtResponse<U, IAdtError> {
  const cleanup = (from as unknown as CleanupCarrier).cleanup;
  if (cleanup === undefined) return onto;
  if ((onto as unknown as CleanupCarrier).cleanup !== undefined) return onto;
  if (!onto.ok) return failure<U>({ ...onto.getError(), cleanup });
  return succeededWithCleanup(onto, { cleanup });
}
