import {
  InstanceState,
  type StatePart,
  StateUnavailableError,
} from '../../../lib/state/InstanceState';

const MINUTE = 60_000;

/** A part the test drives: what it holds, how its disposal answers. */
const part = (opts: { failDispose?: string } = {}) => {
  let held = false;
  let failures: string[] = [];
  let tell: () => void = () => {};
  const dispose = jest.fn(async () => {
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

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('InstanceState — the idle bound on waiting for the user', () => {
  it('held and no call for 30 minutes: every part disposed, the handle invalid, onEmpty fired, one line logged without the handle', async () => {
    const l = logs();
    const s = new InstanceState({ logger: l.logger });
    const a = part();
    s.attach(a.p);
    const emptied = jest.fn();
    s.onEmpty(emptied);
    s.callStarted();
    a.hold();
    s.callEnded();
    const handle = s.handle;

    jest.advanceTimersByTime(30 * MINUTE - 1);
    await flush();
    expect(a.dispose).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await flush();
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(s.holdsState()).toBe(false);
    expect(emptied).toHaveBeenCalledTimes(1);
    expect(s.handle).not.toBe(handle);
    expect(() => s.check(handle)).toThrow(StateUnavailableError);
    expect(l.info).toHaveLength(1);
    expect(l.info[0]).toContain('30 minutes without a call');
    expect(l.info[0]).not.toContain(handle);
  });

  it('a call in flight across the mark ends nothing; the bound restarts from its end', async () => {
    const s = new InstanceState({ logger: logs().logger });
    const a = part();
    s.attach(a.p);
    s.callStarted();
    a.hold();
    s.callEnded();

    jest.advanceTimersByTime(20 * MINUTE);
    s.callStarted(); // a Wait holding on the server
    jest.advanceTimersByTime(40 * MINUTE); // past the mark while waiting
    await flush();
    expect(a.dispose).not.toHaveBeenCalled();
    s.callEnded();

    jest.advanceTimersByTime(30 * MINUTE - 1);
    await flush();
    expect(a.dispose).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await flush();
    expect(a.dispose).toHaveBeenCalledTimes(1);
  });

  it('two calls overlap: the bound runs only once both have ended', async () => {
    const s = new InstanceState({ logger: logs().logger });
    const a = part();
    s.attach(a.p);
    s.callStarted();
    a.hold();
    s.callStarted();
    s.callEnded();
    jest.advanceTimersByTime(60 * MINUTE);
    await flush();
    expect(a.dispose).not.toHaveBeenCalled();
    s.callEnded();
    jest.advanceTimersByTime(30 * MINUTE);
    await flush();
    expect(a.dispose).toHaveBeenCalledTimes(1);
  });

  it("a listener's background re-poll is not user activity: the bound is not reset", async () => {
    const s = new InstanceState({ logger: logs().logger });
    const a = part();
    s.attach(a.p);
    s.callStarted();
    a.hold();
    s.callEnded();
    jest.advanceTimersByTime(29 * MINUTE);
    a.repoll();
    a.repoll();
    jest.advanceTimersByTime(1 * MINUTE);
    await flush();
    expect(a.dispose).toHaveBeenCalledTimes(1);
  });

  it('nothing held: no timer; held again: armed; emptied by a stop: disarmed', () => {
    const s = new InstanceState({ logger: logs().logger });
    const a = part();
    s.attach(a.p);
    s.callStarted();
    s.callEnded();
    expect(jest.getTimerCount()).toBe(0);
    a.hold();
    expect(jest.getTimerCount()).toBe(1);
    s.callStarted();
    expect(jest.getTimerCount()).toBe(0); // paused while a call runs
    s.callEnded();
    expect(jest.getTimerCount()).toBe(1);
  });

  it('the bound is a setting: 45 minutes', async () => {
    const s = new InstanceState({ logger: logs().logger, idleMinutes: 45 });
    const a = part();
    s.attach(a.p);
    a.hold();
    jest.advanceTimersByTime(30 * MINUTE);
    await flush();
    expect(a.dispose).not.toHaveBeenCalled();
    jest.advanceTimersByTime(15 * MINUTE);
    await flush();
    expect(a.dispose).toHaveBeenCalledTimes(1);
  });

  it('dispose clears the timer; shutdown clears it for good', async () => {
    const s = new InstanceState({ logger: logs().logger });
    const a = part();
    s.attach(a.p);
    a.hold();
    expect(jest.getTimerCount()).toBe(1);
    await s.dispose();
    expect(jest.getTimerCount()).toBe(0);

    a.hold();
    expect(jest.getTimerCount()).toBe(1);
    await s.shutdown();
    expect(jest.getTimerCount()).toBe(0);
    a.hold(); // something held after the host let the instance go: no timer any more
    expect(jest.getTimerCount()).toBe(0);
  });

  it('the timer never keeps the process alive: unref is called', () => {
    const real = global.setTimeout;
    const unref = jest.fn();
    const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((
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
      expect(unref).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('a cleanup failure on expiry is recorded and reported; the state stays held for a retry', async () => {
    const l = logs();
    const s = new InstanceState({ logger: l.logger });
    const a = part({ failDispose: 'release debuggee: refused' });
    s.attach(a.p);
    const emptied = jest.fn();
    s.onEmpty(emptied);
    a.hold();
    const handle = s.handle;

    jest.advanceTimersByTime(30 * MINUTE);
    await flush();
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(s.holdsState()).toBe(true);
    expect(s.failures()).toEqual(['release debuggee: refused']);
    expect(emptied).not.toHaveBeenCalled();
    expect(l.error.some((e) => e.includes('release debuggee: refused'))).toBe(
      true,
    );
    expect(l.error.join('\n')).not.toContain(handle);
    // kept for a retry: the handle still serves a stop that may succeed
    expect(() => s.check(handle)).not.toThrow();
    // and the bound is armed again, so a forgotten state is retried
    expect(jest.getTimerCount()).toBe(1);
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
    jest.advanceTimersByTime(30 * MINUTE);
    await flush();
    expect(() => s.check(handle)).not.toThrow();
    fail = false;
    await s.dispose(); // e.g. the host, or a stop the user sent
    expect(() => s.check(handle)).toThrow(StateUnavailableError);
    expect(s.handle).not.toBe(handle);
  });
});

describe('InstanceState — the bound refuses a misconfiguration', () => {
  it.each([29, 0, -1, 30.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'idleMinutes %p is refused',
    (v) => {
      expect(() => new InstanceState({ idleMinutes: v })).toThrow(
        /at least 30/,
      );
    },
  );
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
    expect(() => s.check(handle)).not.toThrow();
    jest.advanceTimersByTime(30 * MINUTE);
    await flush();
    expect(s.holdsState()).toBe(true); // still disposing
    expect(() => s.check(handle)).toThrow(StateUnavailableError);
    release();
    await flush();
    expect(() => s.check(handle)).toThrow(StateUnavailableError);
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
    expect(() => s.check(s.handle)).not.toThrow();
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
    jest.advanceTimersByTime(30 * MINUTE);
    await flush();
    expect(l.info).toHaveLength(1);
    expect(l.info[0]).toMatch(/still finishing/);
    expect(l.info[0]).not.toMatch(/\bended\b/);
    finishing = false;
    held = false;
    tell(); // the last batch arrived
    expect(l.info).toHaveLength(2);
    expect(l.info[1]).toMatch(/ended after 30 minutes without a call/);
  });
});
