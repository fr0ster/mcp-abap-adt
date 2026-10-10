import {
  InstanceState,
  StateUnavailableError,
} from '../../../lib/state/InstanceState';

const part = () => {
  let held = false;
  let cb: () => void = () => {};
  return {
    set: (v: boolean) => {
      held = v;
      cb();
    },
    p: {
      holdsState: () => held,
      pending: () => false,
      failures: () => [],
      dispose: async () => {
        held = false;
      },
      describe: () => (held ? [{ kind: 'abap' }] : []),
      observe: (f: () => void) => {
        cb = f;
      },
    },
  };
};

describe('InstanceState', () => {
  it('a 32-hex handle; holds what its parts hold', () => {
    const s = new InstanceState();
    const a = part();
    s.attach(a.p);
    expect(s.handle).toMatch(/^[0-9A-F]{32}$/);
    expect(s.holdsState()).toBe(false);
    a.set(true);
    expect(s.holdsState()).toBe(true);
    expect(s.describe()).toEqual({
      state_handle: s.handle,
      states: [{ kind: 'abap' }],
    });
  });
  it('check: this handle and something held; otherwise not available — the same answer', () => {
    const s = new InstanceState();
    const a = part();
    s.attach(a.p);
    a.set(true);
    expect(() => s.check(s.handle)).not.toThrow();
    for (const h of [undefined, 42, 'F'.repeat(32)])
      expect(() => s.check(h)).toThrow(StateUnavailableError);
    a.set(false);
    expect(() => s.check(s.handle)).toThrow('state is not available');
  });
  it('endWhenEmpty invalidates the old handle at once when nothing is held', () => {
    const s = new InstanceState();
    const a = part();
    s.attach(a.p);
    const old = s.handle;
    s.endWhenEmpty();
    expect(s.handle).not.toBe(old);
    a.set(true);
    expect(() => s.check(old)).toThrow(StateUnavailableError);
  });
  it('endWhenEmpty while a part still finishes: the old handle serves until it empties, then never again', () => {
    const s = new InstanceState();
    const a = part();
    s.attach(a.p);
    a.set(true);
    const old = s.handle;
    s.endWhenEmpty();
    expect(() => s.check(old)).not.toThrow(); // a retry of the stop may still use it
    a.set(false); // the asynchronous part finished
    expect(s.handle).not.toBe(old);
    a.set(true);
    expect(() => s.check(old)).toThrow(StateUnavailableError);
  });
  it('attach samples a part already holding; dispose that empties it fires onEmpty', async () => {
    const s = new InstanceState();
    const a = part();
    a.set(true);
    s.attach(a.p);
    const seen = jest.fn();
    s.onEmpty(seen);
    await s.dispose();
    expect(seen).toHaveBeenCalledTimes(1);
  });
  it('admit: refuses without an identity; refuses with the holder handle when another instance holds the kind', () => {
    const s = new InstanceState();
    s.host = { owner: null, reserve: () => undefined, peers: () => [] };
    expect(() => s.admit('abap')).toThrow(/no identity/);
    s.host = { owner: 'O', reserve: () => 'OTHERHANDLE', peers: () => [] };
    expect(() => s.admit('abap')).toThrow(/OTHERHANDLE/);
    s.host = { owner: 'O', reserve: () => undefined, peers: () => [] };
    expect(() => s.admit('abap')).not.toThrow();
  });
  it('shutdown waits for a part still finishing after its disposal threw, retries once, answers what is left', async () => {
    const s = new InstanceState();
    const held = true;
    let finishing = false;
    let failures: string[] = [];
    let disposals = 0;
    let tell = () => {};
    s.attach({
      holdsState: () => held,
      pending: () => finishing,
      failures: () => failures,
      describe: () => [],
      observe: (f) => {
        tell = f;
      },
      dispose: async () => {
        disposals++;
        if (disposals === 1) {
          finishing = true;
          throw new Error('clear refused');
        }
      },
    });
    let answer: string[] | undefined;
    const shutting = s.shutdown().then((a) => {
      answer = a;
    });
    await new Promise((r) => setImmediate(r));
    expect(answer).toBeUndefined(); // waiting for the part to settle
    finishing = false;
    failures = ['release debuggee D1: busy'];
    tell();
    await shutting;
    expect(disposals).toBe(2);
    expect(answer).toEqual(['release debuggee D1: busy']);
  });

  it('onEmpty fires when the last part stops holding', () => {
    const s = new InstanceState();
    const a = part();
    s.attach(a.p);
    const seen = jest.fn();
    s.onEmpty(seen);
    a.set(true);
    expect(seen).not.toHaveBeenCalled();
    a.set(false);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('InstanceState — what failed is named', () => {
  it('dispose aggregates what each part could not undo, and the state still reports it held', async () => {
    const s = new InstanceState();
    s.attach({
      holdsState: () => true,
      pending: () => false,
      failures: () => ['close: refused'],
      describe: () => [{ kind: 'abap' }],
      observe: () => {},
      dispose: async () => {
        throw new Error('close: refused');
      },
    });
    s.attach({
      holdsState: () => false,
      pending: () => false,
      failures: () => [],
      describe: () => [],
      observe: () => {},
      dispose: async () => {},
    });
    await expect(s.dispose()).rejects.toThrow('close: refused');
    expect(s.holdsState()).toBe(true);
    expect(s.kindsHeld()).toEqual(['abap']);
  });
  it('shutdown with nothing left answers nothing; with no failure recorded it answers the disposal error', async () => {
    const empty = new InstanceState();
    const a = part();
    a.set(true);
    empty.attach(a.p);
    await expect(empty.shutdown()).resolves.toEqual([]);
    const stuck = new InstanceState();
    stuck.attach({
      holdsState: () => true,
      pending: () => false,
      failures: () => [],
      describe: () => [],
      observe: () => {},
      dispose: async () => {
        throw new Error('refused');
      },
    });
    await expect(stuck.shutdown()).resolves.toEqual(['refused']);
  });
  it('onChange answers its unsubscribe', () => {
    const s = new InstanceState();
    const a = part();
    s.attach(a.p);
    const seen = jest.fn();
    const off = s.onChange(seen);
    a.set(true);
    off();
    a.set(false);
    expect(seen).toHaveBeenCalledTimes(1);
  });
  it('a host-less instance (stdio, SSE) admits without a reservation', () => {
    expect(() => new InstanceState().admit('amdp')).not.toThrow();
  });
});

describe('InstanceState — isolation', () => {
  it('a throwing listener is logged and never reaches the part that changed, nor the other listeners', () => {
    const errors: string[] = [];
    const s = new InstanceState({
      logger: { error: (m: string) => errors.push(m) },
    });
    const a = part();
    s.attach(a.p);
    const after = jest.fn();
    s.onChange(() => {
      throw new Error('observer broke');
    });
    s.onEmpty(() => {
      throw new Error('empty observer broke');
    });
    s.onChange(after);
    expect(() => a.set(true)).not.toThrow();
    expect(() => a.set(false)).not.toThrow();
    expect(after).toHaveBeenCalledTimes(2);
    expect(errors.some((e) => e.includes('observer broke'))).toBe(true);
    expect(errors.some((e) => e.includes('empty observer broke'))).toBe(true);
  });
  it('a part whose dispose throws synchronously does not skip the others, and is named', async () => {
    const s = new InstanceState();
    const second = jest.fn(async () => {});
    s.attach({
      holdsState: () => false,
      pending: () => false,
      failures: () => [],
      describe: () => [],
      observe: () => {},
      dispose: () => {
        throw new Error('sync refusal');
      },
    });
    s.attach({
      holdsState: () => false,
      pending: () => false,
      failures: () => [],
      describe: () => [],
      observe: () => {},
      dispose: second,
    });
    await expect(s.dispose()).rejects.toThrow('sync refusal');
    expect(second).toHaveBeenCalledTimes(1);
  });
  it('two concurrent shutdowns share one run: the state is disposed once', async () => {
    const s = new InstanceState();
    let disposals = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let held = true;
    s.attach({
      holdsState: () => held,
      pending: () => false,
      failures: () => [],
      dispose: async () => {
        disposals++;
        await gate;
        held = false;
      },
      describe: () => [],
      observe: () => {},
    });
    const first = s.shutdown();
    const second = s.shutdown();
    release();
    await expect(first).resolves.toEqual([]);
    await expect(second).resolves.toEqual([]);
    expect(disposals).toBe(1);
    // settled: a later call runs afresh (nothing held, nothing to dispose)
    await expect(s.shutdown()).resolves.toEqual([]);
  });
});
