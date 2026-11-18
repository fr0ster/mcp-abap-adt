/**
 * The pool keeps the instance that holds state: handle routing, lease,
 * eviction, shutdown. Driven by a fake part, no transport.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InstanceState } from '@mcp-abap-adt/lib/state';
import {
  assertRejects,
  assertThrows,
} from '../../../../src/__tests__/helpers/assertions';
import {
  BatchWithHandleError,
  handleFrom,
  handleOf,
  InstancePool,
  PoolClosedError,
} from '../InstancePool';

/**
 * A failure as the pool names it: an ordinal, never the handle — the handle
 * is a bearer secret and these strings reach the log.
 */
const named = (message: string) =>
  new RegExp(
    `^instance \\d+: ${message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
  );

/** `failures` is one failure, named as the pool names `message`. */
function assertNamedOnly(failures: readonly string[], message: string): void {
  assert.equal(failures.length, 1);
  const [only] = failures;
  assert.ok(typeof only === 'string');
  assert.match(only, named(message));
}

/** A poolable whose one part we drive by hand. */
class Fake {
  readonly state = new InstanceState();
  held = false;
  disposed = 0;
  failDispose = false;
  finishLater = false; // dispose resolves while the part still holds (AMDP closing)
  notifyInDispose = false; // the part tells the state synchronously from inside dispose
  finishing = false; // the part's cleanup is still running on its own
  lateFailures: string[] = [];
  throwWhileFinishing = false; // dispose throws, while its cleanup goes on finishing (AMDP: a refused clear, the last batch pending)
  private notify: () => void = () => {};
  constructor(readonly n: number) {
    this.state.attach({
      holdsState: () => this.held,
      pending: () => this.finishing,
      failures: () => this.lateFailures,
      dispose: async () => {
        this.disposed++;
        if (this.throwWhileFinishing) {
          this.throwWhileFinishing = false;
          this.finishing = true;
          throw new Error('clear refused');
        }
        if (this.failDispose) throw new Error('listener still up');
        if (this.lateFailures.length) return; // a retry that cannot undo it either: still held, not finishing
        if (this.finishLater) {
          this.finishLater = false;
          this.finishing = true;
          return;
        }
        this.held = false;
        if (this.notifyInDispose) this.notify();
      },
      observe: (f) => {
        this.notify = f;
      },
    });
  }
  set(v: boolean) {
    this.held = v;
    if (!v) this.finishing = false;
    this.notify();
  }
  /** The cleanup finished on its own but could not undo everything. */
  failLate(message: string) {
    this.finishing = false;
    this.lateFailures = [message];
    this.notify();
  }
  get stateHandle() {
    return this.state.handle;
  }
  holdsState() {
    return this.state.holdsState();
  }
  dispose() {
    return this.state.dispose();
  }
}

let n = 0;
const create = () => new Fake(++n);
const gate = () => {
  let open!: () => void;
  const p = new Promise<void>((r) => {
    open = r;
  });
  return { p, open };
};
const tick = () => new Promise((r) => setImmediate(r));

describe('handleOf', () => {
  it('reads state_handle from a single tools/call only; refuses a batch carrying one', () => {
    assert.equal(
      handleOf({
        method: 'tools/call',
        params: { arguments: { state_handle: 'H' } },
      }),
      'H',
    );
    assert.equal(handleOf({ method: 'tools/list' }), undefined);
    assertThrows(
      () =>
        handleOf([
          {
            method: 'tools/call',
            params: { arguments: { state_handle: 'H' } },
          },
        ]),
      BatchWithHandleError,
    );
    assert.equal(handleOf([{ method: 'tools/list' }]), undefined);
  });
});

describe('handleFrom', () => {
  const call = (handle?: string) => ({
    method: 'tools/call',
    params: { arguments: handle === undefined ? {} : { state_handle: handle } },
  });

  it('reads the x-mcp-state-handle header first, else the tools/call argument', () => {
    assert.equal(handleFrom({ 'x-mcp-state-handle': 'H' }, call('A')), 'H');
    assert.equal(handleFrom({ 'x-mcp-state-handle': 'H' }, call()), 'H');
    assert.equal(
      handleFrom({ 'x-mcp-state-handle': 'H' }, { method: 'ping' }),
      'H',
    );
    assert.equal(handleFrom({}, call('A')), 'A');
    assert.equal(handleFrom({}, call()), undefined);
  });

  it('an empty header is absent', () => {
    assert.equal(handleFrom({ 'x-mcp-state-handle': '' }, call('A')), 'A');
    assert.equal(handleFrom({ 'x-mcp-state-handle': '' }, call()), undefined);
  });

  it('a JSON-RPC batch carrying state_handle is refused, with the header too', () => {
    const batch = [call('A')];
    assertThrows(() => handleFrom({}, batch), BatchWithHandleError);
    assertThrows(
      () => handleFrom({ 'x-mcp-state-handle': 'H' }, batch),
      BatchWithHandleError,
    );
    // A batch without the argument routes by the header.
    assert.equal(handleFrom({ 'x-mcp-state-handle': 'H' }, [call()]), 'H');
  });
});

describe('InstancePool', () => {
  async function holding(pool: InstancePool<Fake>) {
    let inst!: Fake;
    await pool.serve({}, create, async (i) => {
      inst = i;
      i.set(true);
    });
    return inst;
  }

  it('keeps an instance that holds state under its handle; the next request with it gets the same instance', async () => {
    const pool = new InstancePool<Fake>();
    const first = await holding(pool);
    let second!: Fake;
    await pool.serve({ handle: first.stateHandle }, create, async (i) => {
      second = i;
    });
    assert.equal(second, first);
  });

  it('disposes an instance that holds nothing', async () => {
    const pool = new InstancePool<Fake>();
    let i0!: Fake;
    await pool.serve({}, create, async (i) => {
      i0 = i;
    });
    assert.equal(pool.size(), 0);
    assert.equal(i0.disposed, 1);
  });

  it('an unknown handle gets a fresh instance', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    let got!: Fake;
    await pool.serve({ handle: 'NOPE' }, create, async (i) => {
      got = i;
    });
    assert.notEqual(got, held);
  });

  it('serves one instance one request at a time; a queued request whose instance left the pool gets a new one', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    const g = gate();
    const order: string[] = [];
    let second!: Fake;
    const a = pool.serve({ handle: held.stateHandle }, create, async (i) => {
      order.push('a-in');
      await g.p;
      i.set(false);
      order.push('a-out');
    });
    const b = pool.serve({ handle: held.stateHandle }, create, async (i) => {
      order.push('b-in');
      second = i;
    });
    await tick();
    assert.deepStrictEqual(order, ['a-in']);
    g.open();
    await Promise.all([a, b]);
    assert.deepStrictEqual(order, ['a-in', 'a-out', 'b-in']);
    assert.notEqual(second, held); // `a` emptied it: it left the pool before `b`'s turn
  });

  it('an instance that empties on its own is evicted and disposed without a request', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    held.set(false);
    await tick();
    assert.equal(pool.size(), 0);
    assert.equal(held.disposed, 1);
  });

  it('an instance emptied during its own request is disposed once, after the request', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    let disposedDuringWork = -1;
    await pool.serve({ handle: held.stateHandle }, create, async (i) => {
      i.set(false);
      await tick();
      disposedDuringWork = i.disposed;
    });
    assert.equal(disposedDuringWork, 0);
    assert.equal(held.disposed, 1);
    assert.equal(pool.size(), 0);
  });

  it("a disposal that fails on an instance holding nothing: out of routing, retained for shutdown's retry", async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    const handle = held.stateHandle;
    held.failDispose = true;
    held.set(false); // empties: eviction runs and fails
    await tick();
    assert.equal(held.disposed, 1);
    assert.equal(pool.size(), 0); // no longer counted
    assert.equal((pool as any).index.size, 0); // no longer routed
    assert.equal((pool as any).retained.has(held), true); // kept for a retry
    let got!: Fake;
    await pool.serve({ handle }, create, async (i) => {
      got = i;
    });
    assert.notEqual(got, held);
    held.failDispose = false;
    assert.deepStrictEqual(await pool.shutdown(), []); // the retry succeeded
    assert.equal(held.disposed, 2);
  });

  it('a disposal that fails for good on an instance holding nothing is reported by shutdown', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    held.failDispose = true;
    const handle = held.stateHandle;
    held.set(false);
    await tick();
    assert.equal(pool.size(), 0);
    const failures = await pool.shutdown();
    assert.ok(!failures.join('\n').includes(handle));
    assertNamedOnly(failures, 'listener still up');
  });

  it('a fresh instance whose disposal fails is retained and retried at shutdown', async () => {
    const pool = new InstancePool<Fake>();
    let fresh!: Fake;
    await pool.serve(
      {},
      () => {
        fresh = create();
        fresh.failDispose = true;
        return fresh;
      },
      async () => {},
    );
    assert.equal(fresh.disposed, 1);
    fresh.failDispose = false;
    assert.deepStrictEqual(await pool.shutdown(), []);
    assert.equal(fresh.disposed, 2);
  });

  it('a disposal that leaves state finishing keeps ownership; shutdown waits for it to empty', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    held.finishLater = true; // dispose resolves, the part empties later
    let done = false;
    const shutting = pool.shutdown().then((f) => {
      done = true;
      return f;
    });
    await tick();
    assert.equal(done, false);
    held.set(false); // the last batch arrived
    assert.deepStrictEqual(await shutting, []);
  });

  it('a cleanup that fails after its disposal returned is retried once and reported; shutdown ends', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    held.finishLater = true;
    const shutting = pool.shutdown();
    await tick();
    held.failLate('release debuggee D1: busy'); // the last batch arrived; its release failed
    assertNamedOnly(await shutting, 'release debuggee D1: busy');
    assert.equal(held.disposed, 2); // retried once
  });

  it('a disposal that throws while its cleanup is still finishing: shutdown waits for it, then reports only what is left', async () => {
    const pool = new InstancePool<Fake>();
    const a = await holding(pool);
    const b = await holding(pool);
    a.throwWhileFinishing = true;
    b.throwWhileFinishing = true;
    let done = false;
    const shutting = pool.shutdown().then((f) => {
      done = true;
      return f;
    });
    await tick();
    assert.equal(done, false); // both still finishing
    a.set(false); // a's last batch closed everything
    b.failLate('release debuggee D1: busy'); // b's did not
    assertNamedOnly(await shutting, 'release debuggee D1: busy');
  });

  it('a request that leaves nothing behind leaves no entry in the pool', async () => {
    const pool = new InstancePool<Fake>();
    await pool.serve({}, create, async () => {});
    assert.equal((pool as any).busy.size, 0);
    assert.equal((pool as any).retained.size, 0);
    assert.equal(pool.size(), 0);
  });

  it('a part that empties synchronously inside dispose re-enters the eviction harmlessly: disposed once', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    held.notifyInDispose = true; // dispose empties the part and tells the state at once → onEmpty → evict() again
    assert.deepStrictEqual(await pool.shutdown(), []);
    assert.equal(held.disposed, 1);
  });

  it('an unknown handle gets a fresh instance whose state is not available', async () => {
    const pool = new InstancePool<Fake>();
    await holding(pool);
    await pool.serve({ handle: 'NOPE' }, create, async (i) => {
      assertThrows(() => i.state.check('NOPE'), 'state is not available');
    });
  });

  it('follows handle rotation: the old handle stops routing, the new one routes', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    const old = held.stateHandle;
    // A complete stop empties the instance (the handle rotates), and new state is created under the new handle.
    await pool.serve({ handle: old }, create, async (i) => {
      i.state.endWhenEmpty();
      i.set(false);
      i.set(true);
    });
    const rotated = held.stateHandle;
    assert.notEqual(rotated, old);
    assert.equal(pool.size(), 1);
    assert.deepStrictEqual([...(pool as any).index.keys()], [rotated]);
    let viaOld!: Fake;
    await pool.serve({ handle: old }, create, async (i) => {
      viaOld = i;
    });
    assert.notEqual(viaOld, held);
    assertThrows(() => viaOld.state.check(old), 'state is not available');
    let viaNew!: Fake;
    await pool.serve({ handle: rotated }, create, async (i) => {
      viaNew = i;
    });
    assert.equal(viaNew, held);
  });

  it('a rotation outside a request, on an instance whose disposal failed, routes neither handle to it', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    const old = held.stateHandle;
    held.failDispose = true;
    held.state.endWhenEmpty();
    held.set(false); // empties: rotates; eviction fails, the instance is retained only
    await tick();
    assert.equal(pool.size(), 0);
    assert.notEqual(held.stateHandle, old);
    assert.equal((pool as any).index.size, 0);
    let got!: Fake;
    await pool.serve({ handle: old }, create, async (i) => {
      got = i;
    });
    assert.notEqual(got, held);
    held.failDispose = false;
    assert.deepStrictEqual(await pool.shutdown(), []);
  });

  it('a queued request whose handle rotated while it waited gets a new instance', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    const old = held.stateHandle;
    const g = gate();
    const a = pool.serve({ handle: old }, create, async (i) => {
      await g.p;
      i.state.endWhenEmpty();
      i.set(false);
      i.set(true);
    });
    let second!: Fake;
    const b = pool.serve({ handle: old }, create, async (i) => {
      second = i;
    });
    await tick();
    g.open();
    await Promise.all([a, b]);
    assert.notEqual(second, held);
    assert.equal(pool.size(), 1);
  });

  it('shutdown stops admission, waits for an active lease, disposes held instances and reports failures', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    held.failDispose = true;
    const g = gate();
    let leaseDone = false;
    const active = pool.serve(
      { handle: held.stateHandle },
      create,
      async () => {
        await g.p;
        leaseDone = true;
      },
    );
    await tick();
    const shutting = pool.shutdown();
    await tick();
    assert.equal(leaseDone, false); // still waiting for the lease
    g.open();
    await active;
    assertNamedOnly(await shutting, 'listener still up');
    await assertRejects(
      pool.serve({}, create, async () => {}),
      PoolClosedError,
    );
  });
});

describe('the pool never names a failure by its handle', () => {
  async function holding(pool: InstancePool<Fake>) {
    let inst!: Fake;
    await pool.serve({}, create, async (i) => {
      inst = i;
      i.set(true);
    });
    return inst;
  }

  it('two instances failing are told apart by an ordinal, and no handle is in any line', async () => {
    const pool = new InstancePool<Fake>();
    const a = await holding(pool);
    const b = await holding(pool);
    a.failDispose = true;
    b.failDispose = true;
    const handles = [a.stateHandle, b.stateHandle];
    const failures = await pool.shutdown();
    assert.equal(failures.length, 2);
    assert.equal(new Set(failures).size, 2);
    for (const h of handles) assert.ok(!failures.join('\n').includes(h));
  });
});

describe('unique handles across the pool', () => {
  const hex = (n: number) =>
    n.toString(16).padStart(2, '0').repeat(16).toUpperCase();
  const source = (...fills: number[]) => {
    const queue = [...fills];
    return (size: number) => Buffer.alloc(size, queue.shift() ?? 0xee);
  };
  class Drawn {
    held = false;
    readonly state: InstanceState;
    constructor(pool: InstancePool<Drawn>, random: (n: number) => Buffer) {
      this.state = new InstanceState({
        isTaken: pool.isHandleTaken,
        randomSource: random,
      });
      this.state.attach({
        holdsState: () => this.held,
        pending: () => false,
        failures: () => [],
        dispose: async () => {
          this.held = false;
        },
        observe: () => {},
      });
    }
    get stateHandle() {
      return this.state.handle;
    }
    holdsState() {
      return this.held;
    }
    async dispose() {
      this.held = false;
    }
  }

  it('an instance made while the pool holds a repeating draw gets another handle', async () => {
    const pool = new InstancePool<Drawn>();
    const first = new Drawn(pool, source(1));
    first.held = true;
    await pool.serve(
      {},
      () => first,
      async () => {},
    );
    const second = new Drawn(pool, source(1, 2));
    assert.equal(first.stateHandle, hex(1));
    assert.equal(second.stateHandle, hex(2));
  });

  it('a rotation that would repeat a handle in the pool draws again', async () => {
    const pool = new InstancePool<Drawn>();
    const first = new Drawn(pool, source(1));
    first.held = true;
    await pool.serve(
      {},
      () => first,
      async () => {},
    );
    const second = new Drawn(pool, source(2, 1, 3));
    second.held = true;
    await pool.serve(
      {},
      () => second,
      async () => {},
    );
    second.held = false;
    second.state.endWhenEmpty();
    assert.equal(second.stateHandle, hex(3));
  });
});
