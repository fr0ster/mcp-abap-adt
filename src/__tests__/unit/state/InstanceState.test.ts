import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  InstanceState,
  StateUnavailableError,
} from '../../../lib/state/InstanceState';
import { assertRejects, assertThrows } from '../../helpers/assertions';

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
    assert.match(s.handle, /^[0-9A-F]{32}$/);
    assert.equal(s.holdsState(), false);
    a.set(true);
    assert.equal(s.holdsState(), true);
  });
  it('check: this handle and something held; otherwise not available — the same answer', () => {
    const s = new InstanceState();
    const a = part();
    s.attach(a.p);
    a.set(true);
    s.check(s.handle);
    for (const h of [undefined, 'F'.repeat(32)])
      assertThrows(() => s.check(h), StateUnavailableError);
    a.set(false);
    assertThrows(() => s.check(s.handle), 'state is not available');
  });
  it('endWhenEmpty invalidates the old handle at once when nothing is held', () => {
    const s = new InstanceState();
    const a = part();
    s.attach(a.p);
    const old = s.handle;
    s.endWhenEmpty();
    assert.notEqual(s.handle, old);
    a.set(true);
    assertThrows(() => s.check(old), StateUnavailableError);
  });
  it('endWhenEmpty while a part still finishes: the old handle serves until it empties, then never again', () => {
    const s = new InstanceState();
    const a = part();
    s.attach(a.p);
    a.set(true);
    const old = s.handle;
    s.endWhenEmpty();
    s.check(old); // a retry of the stop may still use it
    a.set(false); // the asynchronous part finished
    assert.notEqual(s.handle, old);
    a.set(true);
    assertThrows(() => s.check(old), StateUnavailableError);
  });
  it('attach samples a part already holding; dispose that empties it fires onEmpty', async () => {
    const s = new InstanceState();
    const a = part();
    a.set(true);
    s.attach(a.p);
    const seen = mock.fn();
    s.onEmpty(seen);
    await s.dispose();
    assert.equal(seen.mock.callCount(), 1);
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
    assert.equal(answer, undefined); // waiting for the part to settle
    finishing = false;
    failures = ['release debuggee D1: busy'];
    tell();
    await shutting;
    assert.equal(disposals, 2);
    assert.deepStrictEqual(answer, ['release debuggee D1: busy']);
  });

  it('onEmpty fires when the last part stops holding', () => {
    const s = new InstanceState();
    const a = part();
    s.attach(a.p);
    const seen = mock.fn();
    s.onEmpty(seen);
    a.set(true);
    assert.equal(seen.mock.callCount(), 0);
    a.set(false);
    assert.equal(seen.mock.callCount(), 1);
  });
});

describe('InstanceState — what failed is named', () => {
  it('dispose aggregates what each part could not undo, and the state still reports it held', async () => {
    const s = new InstanceState();
    s.attach({
      holdsState: () => true,
      pending: () => false,
      failures: () => ['close: refused'],
      observe: () => {},
      dispose: async () => {
        throw new Error('close: refused');
      },
    });
    s.attach({
      holdsState: () => false,
      pending: () => false,
      failures: () => [],
      observe: () => {},
      dispose: async () => {},
    });
    await assertRejects(s.dispose(), 'close: refused');
    assert.equal(s.holdsState(), true);
    assert.deepStrictEqual(s.failures(), ['close: refused']);
  });
  it('shutdown with nothing left answers nothing; with no failure recorded it answers the disposal error', async () => {
    const empty = new InstanceState();
    const a = part();
    a.set(true);
    empty.attach(a.p);
    assert.deepStrictEqual(await empty.shutdown(), []);
    const stuck = new InstanceState();
    stuck.attach({
      holdsState: () => true,
      pending: () => false,
      failures: () => [],
      observe: () => {},
      dispose: async () => {
        throw new Error('refused');
      },
    });
    assert.deepStrictEqual(await stuck.shutdown(), ['refused']);
  });
  it('onChange answers its unsubscribe', () => {
    const s = new InstanceState();
    const a = part();
    s.attach(a.p);
    const seen = mock.fn();
    const off = s.onChange(seen);
    a.set(true);
    off();
    a.set(false);
    assert.equal(seen.mock.callCount(), 1);
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
    const after = mock.fn();
    s.onChange(() => {
      throw new Error('observer broke');
    });
    s.onEmpty(() => {
      throw new Error('empty observer broke');
    });
    s.onChange(after);
    a.set(true);
    a.set(false);
    assert.equal(after.mock.callCount(), 2);
    assert.equal(
      errors.some((e) => e.includes('observer broke')),
      true,
    );
    assert.equal(
      errors.some((e) => e.includes('empty observer broke')),
      true,
    );
  });
  it('a part whose dispose throws synchronously does not skip the others, and is named', async () => {
    const s = new InstanceState();
    const second = mock.fn(async () => {});
    s.attach({
      holdsState: () => false,
      pending: () => false,
      failures: () => [],
      observe: () => {},
      dispose: () => {
        throw new Error('sync refusal');
      },
    });
    s.attach({
      holdsState: () => false,
      pending: () => false,
      failures: () => [],
      observe: () => {},
      dispose: second,
    });
    await assertRejects(s.dispose(), 'sync refusal');
    assert.equal(second.mock.callCount(), 1);
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
      observe: () => {},
    });
    const first = s.shutdown();
    const second = s.shutdown();
    release();
    assert.deepStrictEqual(await first, []);
    assert.deepStrictEqual(await second, []);
    assert.equal(disposals, 1);
    // settled: a later call runs afresh (nothing held, nothing to dispose)
    assert.deepStrictEqual(await s.shutdown(), []);
  });

  describe('unique handles', () => {
    /** A random source that answers the given 16-byte fills in order. */
    const source = (...fills: number[]) => {
      const queue = [...fills];
      return (size: number) => Buffer.alloc(size, queue.shift() ?? 0xee);
    };
    const hex = (n: number) =>
      n.toString(16).padStart(2, '0').repeat(16).toUpperCase();

    it('a handle the host holds is drawn again at creation', () => {
      const taken = new Set([hex(1), hex(2)]);
      const s = new InstanceState({
        isTaken: (h) => taken.has(h),
        randomSource: source(1, 2, 3),
      });
      assert.equal(s.handle, hex(3));
    });
    it('a handle the host holds is drawn again at rotation', () => {
      const taken = new Set<string>();
      const s = new InstanceState({
        isTaken: (h) => taken.has(h),
        randomSource: source(1, 2, 3, 4),
      });
      const a = part();
      s.attach(a.p);
      assert.equal(s.handle, hex(1));
      taken.add(hex(2));
      taken.add(hex(3));
      s.endWhenEmpty();
      assert.equal(s.handle, hex(4));
    });
    it('without isTaken every draw stands', () => {
      const s = new InstanceState({ randomSource: source(7) });
      assert.equal(s.handle, hex(7));
    });
    it('two instances created in a row never share a handle', () => {
      const held = new Set<string>();
      const make = () => {
        const s = new InstanceState({
          isTaken: (h) => held.has(h),
          randomSource: source(5, 5, 6),
        });
        held.add(s.handle);
        return s;
      };
      const a = make();
      const b = new InstanceState({
        isTaken: (h) => held.has(h),
        randomSource: source(5, 6),
      });
      assert.equal(a.handle, hex(5));
      assert.equal(b.handle, hex(6));
    });
  });
});
