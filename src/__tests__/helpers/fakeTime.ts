/**
 * Fake time over node:test's `mock.timers` (spec §3.7, §3.8): what the
 * node:test move puts in place of Jest's fake timers, with what
 * `mock.timers` lacks — a count of pending timers (`getTimerCount`), an
 * async advance that lets promise chains run between steps
 * (`advanceTimersByTimeAsync`), a bounded run-all, an advance that follows
 * the work it waits on (`advanceWithRealTime`), a promise read without
 * awaiting (`track`) and one real macrotask turn (`realTurn`).
 *
 * The real `setImmediate` is captured here at module load, before any
 * `enable`, so a turn is real whether `setImmediate` is faked or not.
 * `process.nextTick` and `queueMicrotask` cannot be faked by `mock.timers`:
 * they stay real. The count is kept by wrapping the faked globals; a timer
 * made through an import of `node:timers` is faked by `mock.timers` but not
 * counted — no production source imports it, and
 * `unit/testHelpers/noTimersImport.test.ts` keeps it so.
 *
 * Each clause is proven by a case of `unit/testHelpers/fakeTime.test.ts`.
 */
import assert from 'node:assert/strict';
import { type MockTimers, mock } from 'node:test';

/** An API `mock.timers` can fake. */
export type FakeApi = NonNullable<
  NonNullable<Parameters<MockTimers['enable']>[0]>['apis']
>[number];

// Captured before any `enable`: the real turn.
const realSetImmediate = globalThis.setImmediate;

/**
 * One macrotask turn of the real `setImmediate`: every promise job queued
 * before it runs, and an unhandled rejection is reported, before it
 * resolves. It advances no fake time and fires no fake timer.
 */
export function realTurn(): Promise<void> {
  return new Promise<void>((resolve) => {
    realSetImmediate(() => resolve());
  });
}

/** The timers scheduled through the faked globals, not yet fired or cleared. */
let pending: Set<unknown> | undefined;
/** How many counted timer callbacks have run since `enable`. */
let fired = 0;
/** The globals as `mock.timers` left them, restored by `reset`. */
let unwrap: (() => void) | undefined;

/** Puts `value` in place of the global `name`. */
function setGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

/** Wraps a faked `set…` / `clear…` pair so `pending` counts what it schedules. */
function countPair(
  set: string,
  clear: string,
  repeats: boolean,
  live: Set<unknown>,
): () => void {
  const original = Reflect.get(globalThis, set);
  const originalClear = Reflect.get(globalThis, clear);
  if (typeof original !== 'function' || typeof originalClear !== 'function') {
    return () => {};
  }
  setGlobal(set, (callback: unknown, ...rest: unknown[]) => {
    const run = (...args: unknown[]) => {
      if (!repeats) live.delete(handle);
      fired += 1;
      if (typeof callback === 'function')
        Reflect.apply(callback, undefined, args);
    };
    const handle: unknown = Reflect.apply(original, globalThis, [run, ...rest]);
    live.add(handle);
    return handle;
  });
  setGlobal(clear, (handle: unknown) => {
    live.delete(handle);
    Reflect.apply(originalClear, globalThis, [handle]);
  });
  return () => {
    setGlobal(set, original);
    setGlobal(clear, originalClear);
  };
}

/**
 * Jest's `useFakeTimers`: `mock.timers.enable({ apis, now })`, then the faked
 * timer globals wrapped for the count.
 */
export function useFakeTimers(options: {
  apis: readonly FakeApi[];
  now?: number;
}): void {
  reset();
  mock.timers.enable(
    options.now === undefined
      ? { apis: options.apis }
      : { apis: options.apis, now: options.now },
  );
  const live = new Set<unknown>();
  const restores: (() => void)[] = [];
  if (options.apis.includes('setTimeout')) {
    restores.push(countPair('setTimeout', 'clearTimeout', false, live));
  }
  if (options.apis.includes('setInterval')) {
    restores.push(countPair('setInterval', 'clearInterval', true, live));
  }
  if (options.apis.includes('setImmediate')) {
    restores.push(countPair('setImmediate', 'clearImmediate', false, live));
  }
  pending = live;
  fired = 0;
  unwrap = () => {
    for (const restore of restores) restore();
  };
}

/** Restores `mock.timers` and the counting wrappers: the real globals. */
export function reset(): void {
  unwrap?.();
  unwrap = undefined;
  pending = undefined;
  mock.timers.reset();
}

/** Jest's `useRealTimers`: `reset()`. */
export function useRealTimers(): void {
  reset();
}

function live(): Set<unknown> {
  if (pending === undefined) {
    assert.fail('fake timers are not on: call useFakeTimers first');
  }
  return pending;
}

/** Jest's `getTimerCount`: timers scheduled through the faked globals, not yet fired or cleared. */
export function getTimerCount(): number {
  return live().size;
}

/**
 * Jest's `advanceTimersByTimeAsync`: a real turn, then fake time stepped by
 * 1 ms up to `ms`, a real turn after each step, then the timers due at the
 * end fired and a last turn — so a timer scheduled by a promise chain, or
 * by a firing timer, still fires within `ms` when it is due by then.
 */
export async function advanceTimersByTimeAsync(ms: number): Promise<void> {
  live();
  await realTurn();
  for (let step = 0; step < ms; step += 1) {
    mock.timers.tick(1);
    await realTurn();
  }
  mock.timers.tick(0);
  await realTurn();
}

/** Jest's loop limit for running all timers. */
const LOOP_LIMIT = 100_000;

/**
 * Jest's `runAllTimersAsync`: real turns and `runAll()` until no counted
 * timer is pending; fails after 100 000 timers instead of looping forever.
 */
export async function runAllTimersAsync(): Promise<void> {
  const timers = live();
  const start = fired;
  await realTurn();
  while (timers.size > 0) {
    if (fired - start >= LOOP_LIMIT) {
      assert.fail(
        `runAllTimersAsync: aborted after running ${LOOP_LIMIT} timers, assuming an infinite loop`,
      );
    }
    mock.timers.runAll();
    await realTurn();
  }
}

/** A promise read without awaiting it. */
export interface Tracked<T> {
  readonly settled: boolean;
  /** The fulfilment value; reading it before a fulfilment fails. */
  readonly value: T;
  /** The rejection reason; reading it before a rejection fails. */
  readonly error: unknown;
}

/**
 * `{ settled, value, error }` of `promise`, read without awaiting: a test
 * advances fake time and then asserts `settled`, so a missed timer fails at
 * once instead of hanging the await.
 */
export function track<T>(promise: Promise<T>): Tracked<T> {
  let state:
    | { kind: 'pending' }
    | { kind: 'fulfilled'; value: T }
    | { kind: 'rejected'; error: unknown } = { kind: 'pending' };
  promise.then(
    (value) => {
      state = { kind: 'fulfilled', value };
    },
    (error: unknown) => {
      state = { kind: 'rejected', error };
    },
  );
  return {
    get settled() {
      return state.kind !== 'pending';
    },
    get value(): T {
      if (state.kind === 'pending') assert.fail('the promise has not settled');
      if (state.kind === 'rejected') {
        assert.fail(`the promise rejected: ${String(state.error)}`);
      }
      return state.value;
    },
    get error(): unknown {
      if (state.kind === 'pending') assert.fail('the promise has not settled');
      if (state.kind === 'fulfilled') assert.fail('the promise fulfilled');
      return state.error;
    },
  };
}

/**
 * The real-time advance (spec §3.7): while `work` runs, fake time moves on
 * by `step` fake ms per real turn, up to `horizon` fake ms, and stops
 * earlier once `work` settles. It is bounded in fake time only: once the
 * horizon is spent, an unsettled `work` fails naming the horizon, and a
 * settled one is returned (its rejection thrown).
 */
export async function advanceWithRealTime<T>(
  work: Promise<T>,
  horizon: number,
  step = 50,
): Promise<T> {
  live();
  const tracked = track(work);
  let advanced = 0;
  await realTurn();
  while (!tracked.settled && advanced < horizon) {
    const by = Math.min(step, horizon - advanced);
    mock.timers.tick(by);
    advanced += by;
    await realTurn();
  }
  if (!tracked.settled) {
    assert.fail(
      `advanceWithRealTime: the work did not settle within the fake-time horizon of ${horizon} ms`,
    );
  }
  return work;
}
