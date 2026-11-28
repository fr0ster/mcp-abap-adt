/**
 * The locks a run holds, until SAP answered their release (#394, spec §3).
 *
 * Each lock is in one of two states while it is owned:
 *
 * - `held`: its handle was answered and no unlock has been sent;
 * - `unlock-sent`: an unlock was sent — by a suite, by `releaseAll`, or by a
 *   handler's own `withLock` (a `left_locked` carrier) — and was not answered
 *   `ok`.
 *
 * A lock leaves the registry when its unlock was answered `ok`, or when its
 * connection's session was lost (SAP released it). Nothing is resent: an
 * unlock is sent for a `held` lock only, once, and a lock left `unlock-sent`
 * stays owned and is reported — it ends with its session's logoff, else with
 * SAP's timeout.
 *
 * One registry per run connection (`heldLocksOf`), so a verdict from another
 * connection (the package delete's sibling, spec §7) changes nothing here. No
 * import of the live runner: the unlock is handed in, so the registry is
 * tested alone.
 */
import type { ToolResultLike } from '../../../lib/toolResult';
import { answerOutcome, type StepOutcome, thrownOutcome } from './stepOutcome';

/** A lock a case holds. */
export interface HeldLock {
  readonly object_type: string;
  readonly object_name: string;
  readonly lock_handle: string;
}

/** Where a lock stands while it is owned. */
export type LockState = 'held' | 'unlock-sent';

/** An unlock's answer, as far as the registry reads it. */
export interface UnlockAnswer {
  readonly isError?: boolean | undefined;
  readonly text: string;
}

/** An owned lock and its state. */
export interface OwnedLock {
  readonly lock: HeldLock;
  readonly state: LockState;
}

/** An unlock's answer as a tool answer, for `answerOutcome`. */
const asToolResult = (answer: UnlockAnswer): ToolResultLike => ({
  ...(answer.isError !== undefined && { isError: answer.isError }),
  content: [{ type: 'text', text: answer.text }],
});

/** A member of a JSON value, read by shape. */
function member(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Reflect.get(value, key);
}

/** The locks a run connection owns. */
export class HeldLiveLocks {
  private readonly owned = new Map<
    string,
    {
      lock: HeldLock;
      state: LockState;
      release?: (() => Promise<UnlockAnswer>) | undefined;
    }
  >();

  /**
   * Records a handle the case now holds: `held`. `release` is how this lock
   * is unlocked — on the handler context that took it, which alone holds its
   * handle (#4); `releaseAll` uses it before its own `unlock`.
   */
  hold(lock: HeldLock, release?: () => Promise<UnlockAnswer>): void {
    this.owned.set(lock.lock_handle, { lock, state: 'held', release });
  }

  /** An unlock of `handle` is being sent: `unlock-sent`, and it is never sent again. */
  unlockSent(handle: string): void {
    const entry = this.owned.get(handle);
    if (entry !== undefined) entry.state = 'unlock-sent';
  }

  /** SAP answered the unlock of `handle` with a success: owned no more. */
  released(handle: string): void {
    this.owned.delete(handle);
  }

  /** The session of this registry's connection is lost: SAP released every lock of it. */
  sessionLost(): readonly HeldLock[] {
    const dropped = [...this.owned.values()].map((entry) => entry.lock);
    this.owned.clear();
    return dropped;
  }

  /**
   * An unlock's outcome for `handle`, as `stepOutcome` read it: `ok` releases
   * it, `session-lost` releases every lock of the connection, anything else
   * leaves it `unlock-sent`.
   */
  unlockAnswered(handle: string, outcome: StepOutcome): void {
    if (outcome === 'ok') this.released(handle);
    else if (outcome === 'session-lost') this.sessionLost();
    else this.unlockSent(handle);
  }

  /**
   * The locks a handler's answer says it left behind — a `withLock` carrier
   * with `left_locked: true` and a `lock_handle`, at the top level or under
   * `cleanup`, on a failure or a success — each recorded `unlock-sent`: the
   * handler already sent its unlock. A carrier without `left_locked` (the
   * lock went with its session) records nothing. Answers the locks taken in.
   */
  takeInLeftLocked(answer: ToolResultLike): readonly HeldLock[] {
    let payload: unknown;
    try {
      payload = JSON.parse(answer.content?.[0]?.text ?? '');
    } catch {
      return [];
    }
    const taken: HeldLock[] = [];
    for (const carrier of [payload, member(payload, 'cleanup')]) {
      if (member(carrier, 'left_locked') !== true) continue;
      const handle = member(carrier, 'lock_handle');
      if (typeof handle !== 'string' || handle === '') continue;
      const object = member(carrier, 'object');
      const type = member(object, 'type');
      const name = member(object, 'name');
      const lock: HeldLock = {
        object_type: typeof type === 'string' ? type : '',
        object_name: typeof name === 'string' ? name : '',
        lock_handle: handle,
      };
      this.owned.set(handle, { lock, state: 'unlock-sent' });
      taken.push(lock);
    }
    return taken;
  }

  /** The locks still owned, with their state. */
  get stillOwned(): readonly OwnedLock[] {
    return [...this.owned.values()].map((entry) => ({
      lock: entry.lock,
      state: entry.state,
    }));
  }

  /** The locks still owned, `held` and `unlock-sent` alike. */
  get stillHeld(): readonly HeldLock[] {
    return this.stillOwned.map((entry) => entry.lock);
  }

  /**
   * Sends `unlock` once for every `held` lock, each attempted whatever the
   * others answered, each marked `unlock-sent` before it is sent; a lock
   * already `unlock-sent` is not sent again. An `ok` releases it; any other
   * outcome keeps it, and `report` gets a line naming it and its outcome.
   * Every lock still owned afterwards is reported. Answers them.
   */
  async releaseAll(
    unlock: ((lock: HeldLock) => Promise<UnlockAnswer>) | undefined,
    report: (line: string) => void,
  ): Promise<readonly HeldLock[]> {
    const before = this.stillOwned;
    for (const { lock, state } of before) {
      const entry = this.owned.get(lock.lock_handle);
      if (state !== 'held' || entry === undefined) continue;
      const release =
        entry.release ??
        (unlock === undefined ? undefined : () => unlock(lock));
      if (release === undefined) {
        report(
          `still held (no way to send its unlock): ${lock.object_type} ${lock.object_name}`,
        );
        continue;
      }
      this.unlockSent(lock.lock_handle);
      let outcome: StepOutcome;
      let words: string;
      try {
        const answer = await release();
        outcome = answerOutcome(asToolResult(answer));
        words = answer.text;
      } catch (error) {
        outcome = thrownOutcome(error);
        words = String(error);
      }
      this.unlockAnswered(lock.lock_handle, outcome);
      if (outcome !== 'ok') {
        report(
          `still held (${outcome}): ${lock.object_type} ${lock.object_name}: ${words}`,
        );
      }
    }
    for (const { lock, state } of before) {
      if (state === 'unlock-sent' && this.owned.has(lock.lock_handle)) {
        report(
          `still held (its unlock was sent and not answered ok; not sent again): ${lock.object_type} ${lock.object_name}`,
        );
      }
    }
    return this.stillHeld;
  }
}

const registries = new WeakMap<object, HeldLiveLocks>();

/** The registry of `connection`: one per run connection, made on first use. */
export function heldLocksOf(connection: object): HeldLiveLocks {
  const found = registries.get(connection);
  if (found !== undefined) return found;
  const made = new HeldLiveLocks();
  registries.set(connection, made);
  return made;
}

/** The registry of `connection` if it has one (a soft-mode run connection). */
export function heldLocksIfAny(connection: object): HeldLiveLocks | undefined {
  return registries.get(connection);
}
