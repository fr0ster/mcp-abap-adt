/**
 * Held locks for a handler called directly, outside a server instance.
 *
 * A write, a delete or an unlock under a `lock_handle` is sent only under a
 * handle the instance's own `HandlerLock` kept (#4). A test that calls such
 * a handler for the requests it sends stands for an instance that locked
 * first: the owner here holds the handles it names.
 */
import { HeldLocks } from '../../lib/state/heldLocks';

/** An owner holding `handles`, each in the instance's main session. */
export function holding(...handles: string[]): HeldLocks {
  const locks = new HeldLocks();
  for (const handle of handles) locks.hold(handle);
  return locks;
}

/** An owner holding the call's `lock_handle`, when it names one. */
export function holdingLockOf(
  args: Readonly<Record<string, unknown>>,
): HeldLocks {
  const handle = args.lock_handle;
  return typeof handle === 'string' && handle !== ''
    ? holding(handle)
    : new HeldLocks();
}
