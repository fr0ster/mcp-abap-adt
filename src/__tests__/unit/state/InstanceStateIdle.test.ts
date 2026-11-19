import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import {
  InstanceState,
  type StatePart,
  StateUnavailableError,
} from '../../../lib/state/InstanceState';
import { NO_IDLE_BOUND } from '../../../lib/state/idleBound';
import { assertThrows } from '../../helpers/assertions';
import {
  getTimerCount,
  reset,
  useFakeTimers,
  useRealTimers,
} from '../../helpers/fakeTime';

const MINUTE = 60_000;

/** A part the test drives: what it holds, how its disposal answers. */
const part = (opts: { failDispose?: string } = {}) => {
  let held = false;
  let failures: string[] = [];
  let tell: () => void = () => {};
  const dispose = mock.fn(async () => {
    if (opts.failDispose) {
      failures = [opts.failDispose];
      throw new Error(opts.failDispose);
    }
    held = false;
    tell();
  });
  const p: StatePart = {
    holdsState: () => held,
    pending: () => false,
    failures: () => failures,
    dispose,
    observe: (f) => {
      tell = f;
    },
  };
  return {
    p,
    dispose,
    hold: () => {
      held = true;
      tell();
    },
    /** What a listener's own background re-poll looks like from here: a change, no call. */
    repoll: () => tell(),
  };
};

const logs = () => {
  const info: string[] = [];
  const error: string[] = [];
  return {
    info,
    error,
    logger: {
      info: (m: string) => info.push(m),
      error: (m: string) => error.push(m),
    },
  };
};

/** Lets the expiry's asynchronous disposal run to its end. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() =>
  useFakeTimers({
    apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
  }),
);
afterEach(() => {
  // clearAllTimers() -> reset(), then enabled again with the same options
  // (spec §3.7); the useRealTimers after it, as before.
  reset();
  useFakeTimers({
    apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
  });
  useRealTimers();
});

describe('InstanceState — the idle bound on waiting for the user', () => {
  it('held and no call for 30 minutes: every part disposed, the handle invalid, onEmpty fired, one line logged without the handle', async () => {
    const l = logs();
    const s = new InstanceState({ logger: l.logger });
    const a = part();
    s.attach(a.p);
    const emptied = mock.fn();
    s.onEmpty(emptied);
    s.callStarted();
    a.hold();
    s.callEnded();
    const handle = s.handle;

    mock.timers.tick(30 * MINUTE - 1);
    await flush();
    assert.equal(a.dispose.mock.callCount(), 0);

    mock.timers.tick(1);
    await flush();
    assert.equal(a.dispose.mock.callCount(), 1);
    assert.equal(s.holdsState(), false);
    assert.equal(emptied.mock.callCount(), 1);
    assert.notEqual(s.handle, handle);
    assertThrows(() => s.check(handle), StateUnavailableError);
    assert.equal(l.info.length, 1);
    assert.ok(
      l.info[0].includes('ended by the idle bound (30 minutes without a call)'),
    );
    assert.ok(!l.info[0].includes(handle));
  });

  it('a call in flight across the mark ends nothing; the bound restarts from its end', async () => {
    const s = new InstanceState({ logger: logs().logger });
    const a = part();
    s.attach(a.p);
    s.callStarted();
    a.hold();
    s.callEnded();

    mock.timers.tick(20 * MINUTE);
    s.callStarted(); // a Wait holding on the server
    mock.timers.tick(40 * MINUTE); // past the mark while waiting
    await flush();
    assert.equal(a.dispose.mock.callCount(), 0);
    s.callEnded();

    mock.timers.tick(30 * MINUTE - 1);
    await flush();
    assert.equal(a.dispose.mock.callCount(), 0);
    mock.timers.tick(1);
    await flush();
    assert.equal(a.dispose.mock.callCount(), 1);
  });

  it('two calls overlap: the bound runs only once both have ended', async () => {
    const s = new InstanceState({ logger: logs().logger });
    const a = part();
    s.attach(a.p);
    s.callStarted();
    a.hold();
    s.callStarted();
    s.callEnded();
    mock.timers.tick(60 * MINUTE);
    await flush();
    assert.equal(a.dispose.mock.callCount(), 0);
    s.callEnded();
    mock.timers.tick(30 * MINUTE);
    await flush();
    assert.equal(a.dispose.mock.callCount(), 1);
  });

  it("a listener's background re-poll is not user activity: the bound is not reset", async () => {
    const s = new InstanceState({ logger: logs().logger });
    const a = part();
    s.attach(a.p);
    s.callStarted();
    a.hold();
    s.callEnded();
    mock.timers.tick(29 * MINUTE);
    a.repoll();
    a.repoll();
    mock.timers.tick(1 * MINUTE);
    await flush();
    assert.equal(a.dispose.mock.callCount(), 1);
  });

  it('nothing held: no timer; held again: armed; emptied by a stop: disarmed', () => {
    const s = new InstanceState({ logger: logs().logger });
    const a = part();
    s.attach(a.p);
    s.callStarted();
    s.callEnded();
    assert.equal(getTimerCount(), 0);
    a.hold();
    assert.equal(getTimerCount(), 1);
    s.callStarted();
    assert.equal(getTimerCount(), 0); // paused while a call runs
    s.callEnded();
    assert.equal(getTimerCount(), 1);
  });

  it('the bound is a setting: 45 minutes', async () => {
    const s = new InstanceState({ logger: logs().logger, idleMinutes: 45 });
    const a = part();
    s.attach(a.p);
    a.hold();
    mock.timers.tick(30 * MINUTE);
    await flush();
    assert.equal(a.dispose.mock.callCount(), 0);
    mock.timers.tick(15 * MINUTE);
    await flush();
    assert.equal(a.dispose.mock.callCount(), 1);
  });

  it('dispose clears the timer; shutdown clears it for good', async () => {
    const s = new InstanceState({ logger: logs().logger });
    const a = part();
    s.attach(a.p);
    a.hold();
    assert.equal(getTimerCount(), 1);
    await s.dispose();
    assert.equal(getTimerCount(), 0);

    a.hold();
    assert.equal(getTimerCount(), 1);
    await s.shutdown();
    assert.equal(getTimerCount(), 0);
    a.hold(); // something held after the host let the instance go: no timer any more
    assert.equal(getTimerCount(), 0);
  });

  it('the timer never keeps the process alive: unref is called', (t) => {
    const real = global.setTimeout;
    const unref = mock.fn();
    const spy = t.mock.method(global, 'setTimeout', ((
      fn: () => void,
      ms?: number,
    ) => {
      const t = real(fn, ms);
      const original = t.unref.bind(t);
      t.unref = () => {
        unref();
        return original();
      };
      return t;
    }) as unknown as typeof setTimeout);
    try {
      const s = new InstanceState({ logger: logs().logger });
      const a = part();
      s.attach(a.p);
      a.hold();
      assert.equal(unref.mock.callCount(), 1);
    } finally {
      spy.mock.restore();
    }
  });

  it('a cleanup failure on expiry is recorded and reported; the state stays held for a retry', async () => {
    const l = logs();
    const s = new InstanceState({ logger: l.logger });
    const a = part({ failDispose: 'release debuggee: refused' });
    s.attach(a.p);
    const emptied = mock.fn();
    s.onEmpty(emptied);
    a.hold();
    const handle = s.handle;

    mock.timers.tick(30 * MINUTE);
    await flush();
    assert.equal(a.dispose.mock.callCount(), 1);
    assert.equal(s.holdsState(), true);
    assert.deepStrictEqual(s.failures(), ['release debuggee: refused']);
    assert.equal(emptied.mock.callCount(), 0);
    assert.equal(
      l.error.some((e) => e.includes('release debuggee: refused')),
      true,
    );
    assert.ok(!l.error.join('\n').includes(handle));
    // kept for a retry: the handle still serves a stop that may succeed
    s.check(handle);
    // and the bound is armed again, so a forgotten state is retried
    assert.equal(getTimerCount(), 1);
  });

  it('an expiry that empties after a later retry still invalidates the handle (the end request stands)', async () => {
    const s = new InstanceState({ logger: logs().logger });
    let fail = true;
    let held = true;
    let tell = () => {};
    s.attach({
      holdsState: () => held,
      pending: () => false,
      failures: () => (fail ? ['close: refused'] : []),
      observe: (f) => {
        tell = f;
      },
      dispose: async () => {
        if (fail) throw new Error('close: refused');
        held = false;
        tell();
      },
    });
    const handle = s.handle;
    mock.timers.tick(30 * MINUTE);
    await flush();
    s.check(handle);
    fail = false;
    await s.dispose(); // e.g. the host, or a stop the user sent
    assertThrows(() => s.check(handle), StateUnavailableError);
    assert.notEqual(s.handle, handle);
  });
});

describe('InstanceState — no bound (stdio)', () => {
  it('held, calls start and end, no call for a day: no timer is ever armed, nothing disposed, nothing said', async () => {
    const l = logs();
    const s = new InstanceState({
      logger: l.logger,
      idleMinutes: NO_IDLE_BOUND,
    });
    assert.equal(s.idleMinutes, NO_IDLE_BOUND);
    const a = part();
    s.attach(a.p);
    s.callStarted();
    a.hold();
    s.callEnded();
    a.repoll();
    const handle = s.handle;
    assert.equal(getTimerCount(), 0);
    mock.timers.tick(24 * 60 * MINUTE);
    await flush();
    assert.equal(getTimerCount(), 0);
    assert.equal(a.dispose.mock.callCount(), 0);
    assert.equal(s.holdsState(), true);
    s.check(handle);
    assert.deepStrictEqual(l.info, []);
    assert.deepStrictEqual(l.error, []);
  });

  it('absent is the default bound, 30 minutes: an embedder that passes nothing keeps it', () => {
    assert.equal(new InstanceState({ logger: logs().logger }).idleMinutes, 30);
  });
});

describe('InstanceState — the bound refuses a misconfiguration', () => {
  // Jest's %p of a number is its String(): 29, 0, -1, 30.5, NaN, Infinity.
  for (const v of [29, 0, -1, 30.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    it(`idleMinutes ${String(v)} is refused`, () => {
      assertThrows(() => new InstanceState({ idleMinutes: v }), /at least 30/);
    });
  }
});

describe('InstanceState — while a complete stop is disposing', () => {
  it('a call on the handle is answered "not available" during the expiry; the handle does not serve a stopping session', async () => {
    const s = new InstanceState({ logger: logs().logger });
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let held = true;
    let tell = () => {};
    s.attach({
      holdsState: () => held,
      pending: () => false,
      failures: () => [],
      observe: (f) => {
        tell = f;
      },
      dispose: async () => {
        await gate;
        held = false;
        tell();
      },
    });
    const handle = s.handle;
    s.check(handle);
    mock.timers.tick(30 * MINUTE);
    await flush();
    assert.equal(s.holdsState(), true); // still disposing
    assertThrows(() => s.check(handle), StateUnavailableError);
    release();
    await flush();
    assertThrows(() => s.check(handle), StateUnavailableError);
  });

  it('a plain dispose (no end requested) does not refuse the handle meanwhile', async () => {
    const s = new InstanceState({ logger: logs().logger });
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    s.attach({
      holdsState: () => true,
      pending: () => false,
      failures: () => [],
      observe: () => {},
      dispose: () => gate,
    });
    const disposing = s.dispose();
    s.check(s.handle);
    release();
    await disposing;
  });
});

describe('InstanceState — an expiry whose cleanup is still finishing', () => {
  it('says it is ending, and says "ended" only once the state is empty', async () => {
    const l = logs();
    const s = new InstanceState({ logger: l.logger });
    let held = true;
    let finishing = false;
    let tell = () => {};
    s.attach({
      holdsState: () => held,
      pending: () => finishing,
      failures: () => [],
      observe: (f) => {
        tell = f;
      },
      dispose: async () => {
        finishing = true; // AMDP: the last event batch is still to come
      },
    });
    mock.timers.tick(30 * MINUTE);
    await flush();
    assert.equal(l.info.length, 1);
    assert.match(l.info[0], /still finishing/);
    assert.doesNotMatch(l.info[0], /\bended\b/);
    finishing = false;
    held = false;
    tell(); // the last batch arrived
    assert.equal(l.info.length, 2);
    assert.match(
      l.info[1],
      /ended by the idle bound \(30 minutes without a call\)/,
    );
  });
});
