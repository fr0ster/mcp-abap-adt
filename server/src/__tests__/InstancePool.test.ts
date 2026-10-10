/**
 * The pool keeps the instance that holds state: handle routing, lease,
 * eviction, shutdown. Driven by a fake part, no transport.
 */
import { InstanceState } from '@mcp-abap-adt/lib/state';
import {
  BatchWithHandleError,
  handleOf,
  InstancePool,
  PoolClosedError,
} from '../InstancePool';

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
      describe: () => (this.held ? [{ kind: 'abap' }] : []),
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
    expect(
      handleOf({
        method: 'tools/call',
        params: { arguments: { state_handle: 'H' } },
      }),
    ).toBe('H');
    expect(handleOf({ method: 'tools/list' })).toBeUndefined();
    expect(() =>
      handleOf([
        { method: 'tools/call', params: { arguments: { state_handle: 'H' } } },
      ]),
    ).toThrow(BatchWithHandleError);
    expect(handleOf([{ method: 'tools/list' }])).toBeUndefined();
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
    expect(second).toBe(first);
  });

  it('disposes an instance that holds nothing', async () => {
    const pool = new InstancePool<Fake>();
    let i0!: Fake;
    await pool.serve({}, create, async (i) => {
      i0 = i;
    });
    expect(pool.size()).toBe(0);
    expect(i0.disposed).toBe(1);
  });

  it('an unknown handle gets a fresh instance', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    let got!: Fake;
    await pool.serve({ handle: 'NOPE' }, create, async (i) => {
      got = i;
    });
    expect(got).not.toBe(held);
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
    expect(order).toEqual(['a-in']);
    g.open();
    await Promise.all([a, b]);
    expect(order).toEqual(['a-in', 'a-out', 'b-in']);
    expect(second).not.toBe(held); // `a` emptied it: it left the pool before `b`'s turn
  });

  it('an instance that empties on its own is evicted and disposed without a request', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    held.set(false);
    await tick();
    expect(pool.size()).toBe(0);
    expect(held.disposed).toBe(1);
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
    expect(disposedDuringWork).toBe(0);
    expect(held.disposed).toBe(1);
    expect(pool.size()).toBe(0);
  });

  it("a disposal that fails on an instance holding nothing: out of routing, retained for shutdown's retry", async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    const handle = held.stateHandle;
    held.failDispose = true;
    held.set(false); // empties: eviction runs and fails
    await tick();
    expect(held.disposed).toBe(1);
    expect(pool.size()).toBe(0); // no longer counted
    expect((pool as any).index.size).toBe(0); // no longer routed
    expect((pool as any).retained.has(held)).toBe(true); // kept for a retry
    let got!: Fake;
    await pool.serve({ handle }, create, async (i) => {
      got = i;
    });
    expect(got).not.toBe(held);
    held.failDispose = false;
    expect(await pool.shutdown()).toEqual([]); // the retry succeeded
    expect(held.disposed).toBe(2);
  });

  it('a disposal that fails for good on an instance holding nothing is reported by shutdown', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    held.failDispose = true;
    held.set(false);
    await tick();
    expect(pool.size()).toBe(0);
    expect(await pool.shutdown()).toEqual([
      `${held.stateHandle}: listener still up`,
    ]);
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
    expect(fresh.disposed).toBe(1);
    fresh.failDispose = false;
    expect(await pool.shutdown()).toEqual([]);
    expect(fresh.disposed).toBe(2);
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
    expect(done).toBe(false);
    held.set(false); // the last batch arrived
    expect(await shutting).toEqual([]);
  });

  it('a cleanup that fails after its disposal returned is retried once and reported; shutdown ends', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    held.finishLater = true;
    const shutting = pool.shutdown();
    await tick();
    held.failLate('release debuggee D1: busy'); // the last batch arrived; its release failed
    expect(await shutting).toEqual([
      `${held.stateHandle}: release debuggee D1: busy`,
    ]);
    expect(held.disposed).toBe(2); // retried once
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
    expect(done).toBe(false); // both still finishing
    a.set(false); // a's last batch closed everything
    b.failLate('release debuggee D1: busy'); // b's did not
    expect(await shutting).toEqual([
      `${b.stateHandle}: release debuggee D1: busy`,
    ]);
  });

  it('a request that leaves nothing behind leaves no entry in the pool', async () => {
    const pool = new InstancePool<Fake>();
    await pool.serve({}, create, async () => {});
    expect((pool as any).busy.size).toBe(0);
    expect((pool as any).retained.size).toBe(0);
    expect(pool.size()).toBe(0);
  });

  it('a part that empties synchronously inside dispose re-enters the eviction harmlessly: disposed once', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    held.notifyInDispose = true; // dispose empties the part and tells the state at once → onEmpty → evict() again
    expect(await pool.shutdown()).toEqual([]);
    expect(held.disposed).toBe(1);
  });

  it('an unknown handle gets a fresh instance whose state is not available', async () => {
    const pool = new InstancePool<Fake>();
    await holding(pool);
    await pool.serve({ handle: 'NOPE' }, create, async (i) => {
      expect(() => i.state.check('NOPE')).toThrow('state is not available');
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
    expect(rotated).not.toBe(old);
    expect(pool.size()).toBe(1);
    expect([...(pool as any).index.keys()]).toEqual([rotated]);
    let viaOld!: Fake;
    await pool.serve({ handle: old }, create, async (i) => {
      viaOld = i;
    });
    expect(viaOld).not.toBe(held);
    expect(() => viaOld.state.check(old)).toThrow('state is not available');
    let viaNew!: Fake;
    await pool.serve({ handle: rotated }, create, async (i) => {
      viaNew = i;
    });
    expect(viaNew).toBe(held);
  });

  it('a rotation outside a request, on an instance whose disposal failed, routes neither handle to it', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    const old = held.stateHandle;
    held.failDispose = true;
    held.state.endWhenEmpty();
    held.set(false); // empties: rotates; eviction fails, the instance is retained only
    await tick();
    expect(pool.size()).toBe(0);
    expect(held.stateHandle).not.toBe(old);
    expect((pool as any).index.size).toBe(0);
    let got!: Fake;
    await pool.serve({ handle: old }, create, async (i) => {
      got = i;
    });
    expect(got).not.toBe(held);
    held.failDispose = false;
    expect(await pool.shutdown()).toEqual([]);
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
    expect(second).not.toBe(held);
    expect(pool.size()).toBe(1);
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
    expect(leaseDone).toBe(false); // still waiting for the lease
    g.open();
    await active;
    expect(await shutting).toEqual([`${held.stateHandle}: listener still up`]);
    await expect(pool.serve({}, create, async () => {})).rejects.toThrow(
      PoolClosedError,
    );
  });
});
