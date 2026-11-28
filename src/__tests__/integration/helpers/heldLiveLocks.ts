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
import { afterEach, beforeEach } from 'node:test';
import type { ToolResultLike } from '../../../lib/toolResult';
import { LIVE_SCRIPTS } from './liveScripts';
import { armNetworkCut } from './networkCut';
import { registerOwnedReporter } from './openConnections';
import { type GuardedConnection, observeWire } from './refusalGuard';
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
  /** Objects whose LOCK answer was lost: they may be locked in this session. */
  private readonly unconfirmed = new Set<string>();

  /**
   * Records a handle the case now holds: `held`. `release` is how this lock
   * is unlocked — on the handler context that took it, which alone holds its
   * handle (#4); `releaseAll` uses it before its own `unlock`.
   */
  hold(lock: HeldLock, release?: () => Promise<UnlockAnswer>): void {
    this.owned.set(lock.lock_handle, { lock, state: 'held', release });
    for (const listener of heldListeners) listener();
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

  /**
   * The wire saw a LOCK answered with `lock.lock_handle` (`observeWire`):
   * held, unless the registry already owns that handle (a suite's own
   * record, which knows how to release it, stays as it is).
   */
  heldOnTheWire(lock: HeldLock, release: () => Promise<UnlockAnswer>): void {
    if (this.owned.has(lock.lock_handle)) return;
    this.hold(lock, release);
  }

  /** A LOCK whose answer was lost: the object may be locked in this session. */
  mayBeLocked(object: string): void {
    this.unconfirmed.add(object);
  }

  /** The objects whose LOCK answer was lost (`mayBeLocked`). */
  get mayBeLockedObjects(): readonly string[] {
    return [...this.unconfirmed];
  }

  /** The session of this registry's connection is lost: SAP released every lock of it. */
  sessionLost(): readonly HeldLock[] {
    const dropped = [...this.owned.values()].map((entry) => entry.lock);
    this.owned.clear();
    this.unconfirmed.clear();
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

/** Called on every `hold`: the live network cut's trigger (`networkCut`). */
const heldListeners: Array<() => void> = [];

/** Whether a handler's answer carries a lock it left behind (a `left_locked` carrier). */
export function leavesALock(answer: ToolResultLike): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(answer.content?.[0]?.text ?? '');
  } catch {
    return false;
  }
  return [payload, member(payload, 'cleanup')].some(
    (carrier) => member(carrier, 'left_locked') === true,
  );
}

const registries = new WeakMap<object, HeldLiveLocks>();

/** Every registry of this file's process, for the per-test check. */
const everyRegistry = new Set<HeldLiveLocks>();

/** The registry of `connection`: one per run connection, made on first use. */
export function heldLocksOf(connection: object): HeldLiveLocks {
  const found = registries.get(connection);
  if (found !== undefined) return found;
  const made = new HeldLiveLocks();
  registries.set(connection, made);
  everyRegistry.add(made);
  return made;
}

/** The handles every registry holds `unlock-sent` now. */
export function unlockSentSnapshot(): ReadonlySet<string> {
  const sent = new Set<string>();
  for (const registry of everyRegistry) {
    for (const { lock, state } of registry.stillOwned) {
      if (state === 'unlock-sent') sent.add(lock.lock_handle);
    }
  }
  return sent;
}

/**
 * The locks that became `unlock-sent` since `before`, by object: a release
 * sent during the test that did not reach SAP.
 */
export function unlockSentSince(
  before: ReadonlySet<string>,
): readonly string[] {
  const named: string[] = [];
  for (const registry of everyRegistry) {
    for (const { lock, state } of registry.stillOwned) {
      if (state === 'unlock-sent' && !before.has(lock.lock_handle)) {
        named.push(`${lock.object_type} ${lock.object_name}`);
      }
    }
  }
  return named;
}

/** The registry of `connection` if it has one (a soft-mode run connection). */
export function heldLocksIfAny(connection: object): HeldLiveLocks | undefined {
  return registries.get(connection);
}

// The file's close names the locks a connection still owns (spec §6), and
// the objects a lost LOCK answer may have left locked.
registerOwnedReporter((connection) => {
  const registry = registries.get(connection);
  if (registry === undefined) return [];
  return [
    ...registry.stillOwned.map(
      ({ lock, state }) =>
        `lock ${lock.object_type} ${lock.object_name} (${state})`,
    ),
    ...registry.mayBeLockedObjects.map(
      (object) => `a lock may be held on ${object} (its LOCK answer was lost)`,
    ),
  ];
});

/** The path of a request URL, without its query. */
const pathOf = (url: string): string => {
  const at = url.indexOf('?');
  return at < 0 ? url : url.slice(0, at);
};

/** A query parameter of a URL, decoded; plain code, no pattern. */
function queryParameter(url: string, name: string): string | undefined {
  const at = url.indexOf('?');
  if (at < 0) return undefined;
  for (const pair of url.slice(at + 1).split('&')) {
    const equals = pair.indexOf('=');
    const key = equals < 0 ? pair : pair.slice(0, equals);
    if (key !== name) continue;
    try {
      return decodeURIComponent(equals < 0 ? '' : pair.slice(equals + 1));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** The handle a LOCK answer's document carries, between its LOCK_HANDLE tags. */
function lockHandleIn(data: unknown): string | undefined {
  if (typeof data !== 'string') return undefined;
  const open = '<LOCK_HANDLE>';
  const start = data.indexOf(open);
  if (start < 0) return undefined;
  const end = data.indexOf('</LOCK_HANDLE>', start + open.length);
  if (end < 0) return undefined;
  const handle = data.slice(start + open.length, end).trim();
  return handle === '' ? undefined : handle;
}

const isLockRequest = (url: string) =>
  queryParameter(url, '_action') === 'LOCK';
const isUnlockRequest = (url: string) =>
  queryParameter(url, '_action') === 'UNLOCK';

/** The UNLOCK of `handle` on `object`, sent on `connection` as a client sends it. */
function wireRelease(
  guarded: GuardedConnection,
  object: string,
  handle: string,
): () => Promise<UnlockAnswer> {
  return async () => {
    guarded.setSessionType('stateful');
    try {
      await guarded.makeAdtRequest({
        url: `${object}?_action=UNLOCK&lockHandle=${encodeURIComponent(handle)}`,
        method: 'POST',
        timeout: 0,
        data: null,
      });
      return { text: 'unlocked' };
    } finally {
      guarded.setSessionType('stateless');
    }
  };
}

// The wire of every soft-mode run connection (one with a registry): its
// LOCKs held, its UNLOCKs marked before they leave and released on an
// answer, a lost session clearing its locks — whoever sent them (#394).
observeWire({
  sending(connection, options) {
    const registry = registries.get(connection);
    if (registry === undefined || !isUnlockRequest(options.url)) return;
    const handle = queryParameter(options.url, 'lockHandle');
    if (handle !== undefined) registry.unlockSent(handle);
  },
  answered(connection, options, response) {
    const registry = registries.get(connection);
    if (registry === undefined) return;
    if (response.sessionLost !== undefined) {
      registry.sessionLost();
      return;
    }
    if (isLockRequest(options.url)) {
      const handle = lockHandleIn(response.data);
      const object = pathOf(options.url);
      if (handle === undefined) return;
      registry.heldOnTheWire(
        { object_type: 'adt', object_name: object, lock_handle: handle },
        wireRelease(connection, object, handle),
      );
    } else if (isUnlockRequest(options.url)) {
      const handle = queryParameter(options.url, 'lockHandle');
      if (handle !== undefined) registry.released(handle);
    }
  },
  threw(connection, options, thrown) {
    const registry = registries.get(connection);
    if (registry === undefined) return;
    if (thrownOutcome(thrown) === 'session-lost') {
      registry.sessionLost();
      return;
    }
    if (isLockRequest(options.url) && thrownOutcome(thrown) !== 'refused') {
      registry.mayBeLocked(pathOf(options.url));
    }
  },
});

// A live run's network cut, armed when the file loads the registry (spec §8):
// nothing is patched unless the run asks for it.
armNetworkCut(process.env, (onHeld) => heldListeners.push(onHeld));

// A live test whose step left a lock behind fails at once (#394): a release
// sent during the test that did not reach SAP is the test's failure,
// whichever suite or tester ran it. Only in a live run's file processes.
if (
  process.env.NODE_TEST_CONTEXT !== undefined &&
  LIVE_SCRIPTS.has(process.env.npm_lifecycle_event ?? '')
) {
  let before: ReadonlySet<string> = new Set();
  beforeEach(() => {
    before = unlockSentSnapshot();
  });
  afterEach(() => {
    const left = unlockSentSince(before);
    if (left.length > 0) {
      throw new Error(
        `a lock this test held was not released (its unlock did not reach SAP, not sent again): ${left.join('; ')}`,
      );
    }
  });
}
