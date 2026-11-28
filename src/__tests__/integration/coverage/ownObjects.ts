/**
 * What the coverage live suites share: the package a run may create in,
 * the request it writes on, and how an answer is read.
 *
 * **The package.** `$TMP` or the development package on premise, the build
 * package on the cloud (which has no `$TMP`): the configured package must be
 * exactly one of them, read before anything is created; otherwise the case
 * refuses, naming only the accepted ones (as
 * `activateObjectsRefusal.live.test.ts` does).
 */
import {
  configuredSystemKind,
  resolvePackageName,
  resolveTransportRequest,
} from '../helpers/configHelpers';
import type { HeldLock } from '../helpers/heldLiveLocks';
import { type LiveAnswer, livePrepare } from '../helpers/live';
import { liveLocks, liveSucceeded } from '../helpers/liveSteps';
import { CREATION_PACKAGES } from '../helpers/packageGuard';
import { isHardModeEnabled } from '../helpers/testers/hardMode';

/** Whether the configured system is the on-premise one. */
export const onPremise = (): boolean => configuredSystemKind() === 'onprem';

/**
 * The package a case creates in: `$TMP` on premise, the configured package
 * on the cloud — each checked against the accepted ones first.
 */
export function ownPackage(): string {
  const accepted = CREATION_PACKAGES[onPremise() ? 'onprem' : 'cloud'];
  const chosen = onPremise() ? '$TMP' : resolvePackageName();
  if (!accepted.includes(chosen)) {
    throw new Error(
      `the package is none of ${accepted.join(', ')}: nothing is created`,
    );
  }
  return chosen;
}

/**
 * The request a write goes on: none for `$TMP`, else the configured one
 * (none when none is configured). As a property value, for a `liveCall`'s
 * literal arguments.
 */
export function request(): string | undefined {
  if (ownPackage() === '$TMP') return undefined;
  const configured = resolveTransportRequest();
  return configured === undefined || configured === '' ? undefined : configured;
}

/** No request for `$TMP`; the configured one for any other package. */
export function onRequest(): { transport_request?: string } {
  const given = request();
  return given === undefined ? {} : { transport_request: given };
}

/**
 * The answer, or the case fails naming the step and what was answered — in
 * soft mode by the answer's outcome (`liveSucceeded`, #394).
 */
export function succeeded(step: string, answer: LiveAnswer): LiveAnswer {
  return liveSucceeded(step, answer);
}

/** A member of a JSON value, read by shape. */
export function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** An answer's JSON payload. */
export function payloadOf(answer: LiveAnswer): unknown {
  return JSON.parse(answer.text);
}

/**
 * The compact locks the suites' cases hold until SAP answers their unlock:
 * the run connection's registry in soft mode (#394), so the file's close
 * sees them.
 */
const heldLocks = {
  hold: (lock: HeldLock) => liveLocks().hold(lock),
  released: (handle: string) => liveLocks().released(handle),
  unlockSent: (handle: string) => liveLocks().unlockSent(handle),
  releaseAll: (
    ...args: Parameters<ReturnType<typeof liveLocks>['releaseAll']>
  ) => liveLocks().releaseAll(...args),
  get stillOwned() {
    return liveLocks().stillOwned;
  },
};

/** Records a lock handle the case now holds. */
export function holdLock(lock: HeldLock): void {
  heldLocks.hold(lock);
}

/** SAP answered the case's unlock of `handle` with a success. */
export function lockReleased(handle: string): void {
  heldLocks.released(handle);
}

/**
 * The case is about to send the unlock of `handle`. In soft mode the lock is
 * then `unlock-sent` and the suite's end does not send it again (#394:
 * nothing is resent); hard mode keeps its own behaviour, the suite's end
 * unlocking what is still held.
 */
export function unlockSending(handle: string): void {
  if (!isHardModeEnabled()) heldLocks.unlockSent(handle);
}

/**
 * The unlock of every lock a case still holds, each attempted whatever the
 * others answered; a lock SAP still holds is named in the suite's output,
 * and the suite goes on to its deletions.
 */
export async function releaseHeldLocks(): Promise<void> {
  await heldLocks.releaseAll(
    (lock) => livePrepare('HandlerLock', { action: 'unlock', ...lock }),
    (line) => console.log(`[held locks] ${line}`),
  );
}

/**
 * Names every lock a case still holds, sending nothing: for a suite whose
 * cases send their unlock themselves, once.
 */
export function reportHeldLocks(): void {
  for (const { lock, state } of heldLocks.stillOwned) {
    console.log(
      `[held locks] still held (${state}): ${lock.object_type} ${lock.object_name}`,
    );
  }
}
