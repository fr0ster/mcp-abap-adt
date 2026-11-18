/**
 * The fake-time helper (`helpers/fakeTime.ts`, spec §3.7, §3.8): what
 * `mock.timers` fakes on the Node running it, and each clause of the
 * helper, each by a case that fails when the clause is broken. A wait that
 * a broken helper could leave hanging is bounded by real turns of this
 * file's own `setImmediate`, captured before any fake is enabled, so the
 * case fails instead of hanging.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, it, mock } from 'node:test';
import {
  advanceTimersByTimeAsync,
  advanceWithRealTime,
  type FakeApi,
  getTimerCount,
  realTurn,
  reset,
  runAllTimersAsync,
  track,
  useFakeTimers,
  useRealTimers,
} from '../../helpers/fakeTime';
import { REAL_TURN_UNHANDLED } from './scenarios/realTurnUnhandled.scenario';

// The real globals, captured before any case enables a fake.
const REAL = {
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
  setImmediate: globalThis.setImmediate,
  clearImmediate: globalThis.clearImmediate,
  Date: globalThis.Date,
  nextTick: process.nextTick,
  queueMicrotask: globalThis.queueMicrotask,
};

const ALL: readonly FakeApi[] = [
  'setTimeout',
  'setInterval',
  'setImmediate',
  'Date',
];

/** One real turn of this file's own captured `setImmediate`. */
const ownTurn = () =>
  new Promise<void>((resolve) => {
    REAL.setImmediate(() => resolve());
  });

/**
 * `promise` settles within `turns` real turns of this file's own, or the
 * case fails — it never hangs. Its settled flag is this file's own, not the
 * helper's `track`: a broken helper cannot hold the bound open.
 */
async function settlesWithin<T>(promise: Promise<T>, turns = 2000): Promise<T> {
  let settled = false;
  const done = () => {
    settled = true;
  };
  promise.then(done, done);
  for (let i = 0; i < turns && !settled; i += 1) await ownTurn();
  assert.ok(settled, `not settled within ${turns} real turns`);
  return promise;
}

afterEach(() => reset());

describe('mock.timers on this Node', () => {
  it('mock.timers fakes setTimeout, setInterval, setImmediate and Date on this Node', async () => {
    mock.timers.enable({ apis: ALL, now: 0 });
    try {
      assert.notEqual(globalThis.setTimeout, REAL.setTimeout);
      assert.notEqual(globalThis.setInterval, REAL.setInterval);
      assert.notEqual(globalThis.setImmediate, REAL.setImmediate);
      assert.notEqual(globalThis.Date, REAL.Date);
      const ran: string[] = [];
      setTimeout(() => ran.push('timeout'), 10);
      setInterval(() => ran.push('interval'), 10);
      setImmediate(() => ran.push('immediate'));
      await ownTurn();
      assert.deepEqual(ran, [], 'nothing runs on real time');
      assert.equal(Date.now(), 0);
      mock.timers.tick(10);
      assert.deepEqual(ran.sort(), ['immediate', 'interval', 'timeout']);
      assert.equal(Date.now(), 10);
    } finally {
      mock.timers.reset();
    }
  });

  it('process.nextTick and queueMicrotask stay real', async () => {
    mock.timers.enable({ apis: ALL, now: 0 });
    try {
      assert.equal(process.nextTick, REAL.nextTick);
      assert.equal(globalThis.queueMicrotask, REAL.queueMicrotask);
      await settlesWithin(
        new Promise<void>((resolve) => process.nextTick(resolve)),
        1,
      );
      await settlesWithin(
        new Promise<void>((resolve) => queueMicrotask(resolve)),
        1,
      );
    } finally {
      mock.timers.reset();
    }
  });
});

describe('useFakeTimers / useRealTimers / reset', () => {
  it('useFakeTimers with now sets Date.now', () => {
    useFakeTimers({ apis: ['Date'], now: 1_234_567 });
    assert.equal(Date.now(), 1_234_567);
    assert.equal(
      new Date().toISOString(),
      new Date(1_234_567).toISOString(),
      'a new Date reads it too',
    );
  });

  it('useRealTimers restores the real globals', () => {
    useFakeTimers({ apis: ALL, now: 0 });
    useRealTimers();
    assert.equal(globalThis.setTimeout, REAL.setTimeout);
    assert.equal(globalThis.clearTimeout, REAL.clearTimeout);
    assert.equal(globalThis.setInterval, REAL.setInterval);
    assert.equal(globalThis.clearInterval, REAL.clearInterval);
    assert.equal(globalThis.setImmediate, REAL.setImmediate);
    assert.equal(globalThis.clearImmediate, REAL.clearImmediate);
    assert.equal(globalThis.Date, REAL.Date);
  });

  it('reset restores mock.timers and its counting wrappers', () => {
    useFakeTimers({ apis: ['setTimeout', 'setInterval'] });
    reset();
    assert.equal(globalThis.setTimeout, REAL.setTimeout);
    assert.equal(globalThis.clearTimeout, REAL.clearTimeout);
    assert.equal(globalThis.setInterval, REAL.setInterval);
    assert.equal(globalThis.clearInterval, REAL.clearInterval);
    assert.throws(() => getTimerCount(), /not on/);
  });
});

describe('getTimerCount', () => {
  it('getTimerCount counts scheduled, not fired, not cleared timers', () => {
    useFakeTimers({ apis: ALL, now: 0 });
    setTimeout(() => {}, 10);
    const second = setTimeout(() => {}, 20);
    setTimeout(() => {}, 30);
    const interval = setInterval(() => {}, 5);
    setImmediate(() => {});
    assert.equal(getTimerCount(), 5);
    clearTimeout(second);
    assert.equal(getTimerCount(), 4, 'a cleared timeout is not counted');
    mock.timers.tick(10);
    assert.equal(getTimerCount(), 2, 'fired timeouts and immediates are not');
    clearInterval(interval);
    assert.equal(getTimerCount(), 1, 'a cleared interval is not counted');
  });

  it('getTimerCount is 0 after the advance that fired all', async () => {
    useFakeTimers({ apis: ALL, now: 0 });
    setTimeout(() => {}, 10);
    setTimeout(() => {}, 20);
    setImmediate(() => {});
    await settlesWithin(advanceTimersByTimeAsync(20));
    assert.equal(getTimerCount(), 0);
  });
});

describe('advanceTimersByTimeAsync', () => {
  it('advanceTimersByTimeAsync runs a real turn before, between steps and after', async () => {
    useFakeTimers({ apis: ['setTimeout', 'Date'], now: 0 });
    const fired: string[] = [];
    // Before: scheduled only after one real turn; due at 10 when that turn
    // comes before the first step, at 11 when it does not.
    void ownTurn().then(() => {
      setTimeout(() => fired.push('before'), 10);
    });
    // Between: a timer at 3 whose continuation, after one real turn,
    // schedules one 1 ms later: due by 10 only when real turns run between
    // the steps.
    void new Promise<void>((resolve) => setTimeout(resolve, 3))
      .then(() => ownTurn())
      .then(() => {
        setTimeout(() => fired.push('between'), 1);
      });
    // After: a timer at 10 whose continuation, after one real turn,
    // records — before the advance resolves only when a turn ends it.
    void new Promise<void>((resolve) => setTimeout(resolve, 10))
      .then(() => ownTurn())
      .then(() => {
        fired.push('after');
      });
    // What had fired when the advance resolved, read at that moment: no
    // turn of this case's own counts, and the wait is bounded.
    const atEnd = await settlesWithin(
      advanceTimersByTimeAsync(10).then(() => [...fired]),
    );
    assert.ok(atEnd.includes('before'), `before: ${atEnd}`);
    assert.ok(atEnd.includes('between'), `between: ${atEnd}`);
    assert.ok(atEnd.includes('after'), `after: ${atEnd}`);
    assert.equal(Date.now(), 10);
  });

  it('it works with setImmediate faked', async () => {
    useFakeTimers({ apis: ALL, now: 0 });
    let fired = false;
    setTimeout(() => {
      fired = true;
    }, 3);
    await settlesWithin(advanceTimersByTimeAsync(3));
    assert.equal(fired, true);
  });

  it('a timer scheduled by a firing timer fires within the same advance when due', async () => {
    useFakeTimers({ apis: ['setTimeout', 'Date'], now: 0 });
    const fired: number[] = [];
    setTimeout(() => {
      setTimeout(() => fired.push(Date.now()), 5);
    }, 10);
    await settlesWithin(advanceTimersByTimeAsync(14));
    assert.deepEqual(fired, [], 'not due before 15');
    await settlesWithin(advanceTimersByTimeAsync(1));
    assert.deepEqual(fired, [15]);
  });

  it('a zero-delay timer scheduled during the last step fires within the same advance', async () => {
    useFakeTimers({ apis: ['setTimeout', 'Date'], now: 0 });
    const fired: string[] = [];
    // From the callback of the timer the last step fires.
    setTimeout(() => {
      setTimeout(() => fired.push('callback'), 0);
    }, 5);
    // From a promise continuation of that step, run in its real turn.
    void new Promise<void>((resolve) => setTimeout(resolve, 5)).then(() => {
      setTimeout(() => fired.push('continuation'), 0);
    });
    await settlesWithin(advanceTimersByTimeAsync(5));
    assert.deepEqual(fired.sort(), ['callback', 'continuation']);
    assert.equal(Date.now(), 5);
  });

  it('an interval of 10 fires 3 times over 35', async () => {
    useFakeTimers({ apis: ['setInterval', 'Date'], now: 0 });
    let count = 0;
    setInterval(() => {
      count += 1;
    }, 10);
    await settlesWithin(advanceTimersByTimeAsync(35));
    assert.equal(count, 3);
  });

  it("a timer cleared by another's callback never fires", async () => {
    useFakeTimers({ apis: ['setTimeout', 'Date'], now: 0 });
    let fired = false;
    const later = setTimeout(() => {
      fired = true;
    }, 10);
    setTimeout(() => clearTimeout(later), 5);
    await settlesWithin(advanceTimersByTimeAsync(20));
    assert.equal(fired, false);
    assert.equal(getTimerCount(), 0);
  });
});

describe('runAllTimersAsync', () => {
  it('runAllTimersAsync drains chained timers', async () => {
    useFakeTimers({ apis: ['setTimeout', 'Date'], now: 0 });
    const fired: number[] = [];
    const wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));
    void wait(10)
      .then(() => {
        fired.push(Date.now());
        return wait(100);
      })
      .then(() => {
        fired.push(Date.now());
        return wait(1000);
      })
      .then(() => {
        fired.push(Date.now());
      });
    await settlesWithin(runAllTimersAsync(), 100);
    assert.deepEqual(fired, [10, 110, 1110]);
    assert.equal(getTimerCount(), 0);
  });

  it('runAllTimersAsync fails after 100000 timers', async () => {
    useFakeTimers({ apis: ['setTimeout', 'Date'], now: 0 });
    let runs = 0;
    const again = () => {
      runs += 1;
      setTimeout(again, 1);
    };
    setTimeout(again, 1);
    await assert.rejects(
      settlesWithin(runAllTimersAsync(), 200_000),
      (error: unknown) =>
        error instanceof assert.AssertionError &&
        error.message.includes('100000 timers'),
    );
    assert.equal(runs, 100_000);
  });
});

describe('advanceWithRealTime', () => {
  it('advanceWithRealTime settles work waiting on a timer inside the horizon', async () => {
    useFakeTimers({ apis: ALL, now: 0 });
    const work = new Promise<string>((resolve) =>
      setTimeout(() => resolve('done'), 1_000),
    );
    assert.equal(await settlesWithin(advanceWithRealTime(work, 2_000)), 'done');
  });

  it('advanceWithRealTime fails naming the horizon when the timer lies beyond it', async () => {
    useFakeTimers({ apis: ALL, now: 0 });
    const work = new Promise<string>((resolve) =>
      setTimeout(() => resolve('late'), 5_000),
    );
    await assert.rejects(
      settlesWithin(advanceWithRealTime(work, 2_000)),
      (error: unknown) =>
        error instanceof assert.AssertionError &&
        error.message.includes('horizon of 2000 ms'),
    );
    assert.equal(Date.now(), 2_000, 'fake time ran out at the horizon');
  });

  it('advanceWithRealTime fails when work waits on no timer', async () => {
    useFakeTimers({ apis: ALL, now: 0 });
    await assert.rejects(
      settlesWithin(advanceWithRealTime(new Promise<never>(() => {}), 2_000)),
      (error: unknown) =>
        error instanceof assert.AssertionError &&
        error.message.includes('horizon of 2000 ms'),
    );
  });

  it('advanceWithRealTime stops early when work settles', async () => {
    useFakeTimers({ apis: ALL, now: 0 });
    const work = new Promise<void>((resolve) => setTimeout(resolve, 100));
    await settlesWithin(advanceWithRealTime(work, 10_000));
    assert.ok(Date.now() < 10_000, `advanced to ${Date.now()}`);
    assert.ok(Date.now() >= 100);
  });

  it('advanceWithRealTime steps by step fake ms, 50 by default', async () => {
    useFakeTimers({ apis: ALL, now: 0 });
    const work = new Promise<void>((resolve) => setTimeout(resolve, 200));
    await settlesWithin(advanceWithRealTime(work, 1_000, 30));
    assert.equal(Date.now(), 210, 'stepped 30 ms at a time');
    const next = new Promise<void>((resolve) => setTimeout(resolve, 120));
    await settlesWithin(advanceWithRealTime(next, 1_000));
    assert.equal(Date.now(), 360, 'stepped 50 ms at a time');
  });
});

describe('track', () => {
  it('track reads settled without awaiting', async () => {
    const tracked = track(Promise.resolve(1));
    assert.equal(tracked.settled, false);
    await ownTurn();
    assert.equal(tracked.settled, true);
    assert.equal(tracked.value, 1);
  });

  it('reading value of an unsettled promise fails', () => {
    const tracked = track(new Promise<number>(() => {}));
    assert.throws(
      () => tracked.value,
      (error: unknown) =>
        error instanceof assert.AssertionError &&
        error.message.includes('not settled'),
    );
  });

  it('reading value of a rejected promise fails', async () => {
    const reason = new Error('the reason');
    const tracked = track(Promise.reject(reason));
    await ownTurn();
    assert.equal(tracked.settled, true);
    assert.throws(
      () => tracked.value,
      (error: unknown) =>
        error instanceof assert.AssertionError &&
        error.message.includes('rejected') &&
        error.message.includes('the reason'),
    );
    assert.equal(tracked.error, reason);
  });
});

describe('realTurn', () => {
  it('realTurn resolves with setImmediate faked and no fake time advanced', async () => {
    useFakeTimers({ apis: ALL, now: 0 });
    let immediate = false;
    let timeout = false;
    setImmediate(() => {
      immediate = true;
    });
    setTimeout(() => {
      timeout = true;
    }, 0);
    await settlesWithin(realTurn(), 5);
    assert.equal(immediate, false, 'a fake setImmediate ran');
    assert.equal(timeout, false, 'a fake setTimeout(0) ran');
    assert.equal(Date.now(), 0);
  });

  it('realTurn resolves with fake timers off', async () => {
    await settlesWithin(realTurn(), 5);
  });

  it('realTurn lets a rejection without a handler reach unhandledRejection before it resolves', () => {
    // In a plain node process: node:test's own handler would fail this
    // case on the rejection the scenario leaves unhandled.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, [REAL_TURN_UNHANDLED], {
      encoding: 'utf8',
      env,
    });
    assert.equal(run.status, 0, run.stderr);
    const lines = run.stdout.trim().split('\n');
    assert.deepEqual(JSON.parse(lines[lines.length - 1] ?? ''), {
      seenBeforeResolve: ['left unhandled'],
    });
  });

  it('realTurn after a real setImmediate scheduled before it resolves after that callback', async () => {
    const order: string[] = [];
    setImmediate(() => order.push('immediate'));
    await settlesWithin(
      realTurn().then(() => {
        order.push('realTurn');
      }),
      5,
    );
    assert.deepEqual(order, ['immediate', 'realTurn']);
  });
});
