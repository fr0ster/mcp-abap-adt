/**
 * The pool keeps the instance that holds state: lease, owner index, slots,
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
  async function holding(pool: InstancePool<Fake>, owner = 'A') {
    let inst!: Fake;
    await pool.serve({ owner }, create, async (i) => {
      inst = i;
      i.set(true);
    });
    return inst;
  }

  it('keeps an instance that holds state under its handle; the next request with it gets the same instance', async () => {
    const pool = new InstancePool<Fake>();
    const first = await holding(pool);
    let second!: Fake;
    await pool.serve(
      { handle: first.stateHandle, owner: 'A' },
      create,
      async (i) => {
        second = i;
      },
    );
    expect(second).toBe(first);
  });

  it('disposes an instance that holds nothing', async () => {
    const pool = new InstancePool<Fake>();
    let i0!: Fake;
    await pool.serve({ owner: 'A' }, create, async (i) => {
      i0 = i;
    });
    expect(pool.size()).toBe(0);
    expect(i0.disposed).toBe(1);
  });

  it('another owner, or an unknown handle, gets a fresh instance', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    for (const req of [
      { handle: held.stateHandle, owner: 'B' },
      { handle: 'NOPE', owner: 'A' },
    ]) {
      let got!: Fake;
      await pool.serve(req, create, async (i) => {
        got = i;
      });
      expect(got).not.toBe(held);
    }
  });

  it('serves one instance one request at a time; a queued request whose instance left the pool gets a new one', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    const g = gate();
    const order: string[] = [];
    let second!: Fake;
    const a = pool.serve(
      { handle: held.stateHandle, owner: 'A' },
      create,
      async (i) => {
        order.push('a-in');
        await g.p;
        i.set(false);
        order.push('a-out');
      },
    );
    const b = pool.serve(
      { handle: held.stateHandle, owner: 'A' },
      create,
      async (i) => {
        order.push('b-in');
        second = i;
      },
    );
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

  it('the per-owner slot: a second start of the kind is told the holder; peers lists the owner states', async () => {
    const pool = new InstancePool<Fake>();
    let firstHandle = '';
    await pool.serve({ owner: 'A' }, create, async (i) => {
      i.state.admit('abap');
      i.set(true);
      firstHandle = i.stateHandle;
    });
    await pool.serve({ owner: 'A' }, create, async (i) => {
      expect(() => i.state.admit('abap')).toThrow(firstHandle);
      expect(i.state.host!.peers().map((p) => p.state_handle)).toContain(
        firstHandle,
      );
    });
    await pool.serve({ owner: 'B' }, create, async (i) => {
      expect(() => i.state.admit('abap')).not.toThrow();
    });
  });

  it('a reservation in progress holds the slot: a concurrent start of the owner is told the holder', async () => {
    const pool = new InstancePool<Fake>();
    const g = gate();
    let firstHandle = '';
    const first = pool.serve({ owner: 'A' }, create, async (i) => {
      i.state.admit('abap');
      firstHandle = i.stateHandle;
      await g.p;
      i.set(true);
    });
    await tick();
    await pool.serve({ owner: 'A' }, create, async (i) => {
      expect(() => i.state.admit('abap')).toThrow(firstHandle);
    });
    g.open();
    await first;
  });

  it('a failed start releases its slot', async () => {
    const pool = new InstancePool<Fake>();
    await pool.serve({ owner: 'A' }, create, async (i) => {
      i.state.admit('abap'); /* nothing held: the start failed */
    });
    await pool.serve({ owner: 'A' }, create, async (i) => {
      expect(() => i.state.admit('abap')).not.toThrow();
    });
  });

  it('an instance emptied during its own request is disposed once, after the request', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    let disposedDuringWork = -1;
    await pool.serve(
      { handle: held.stateHandle, owner: 'A' },
      create,
      async (i) => {
        i.set(false);
        await tick();
        disposedDuringWork = i.disposed;
      },
    );
    expect(disposedDuringWork).toBe(0);
    expect(held.disposed).toBe(1);
    expect(pool.size()).toBe(0);
  });

  it("a disposal that fails on an instance holding nothing: out of routing and peers, retained for shutdown's retry", async () => {
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
    await pool.serve({ handle, owner: 'A' }, create, async (i) => {
      got = i;
      expect(i.state.host!.peers()).toEqual([]); // not listed with empty states
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
      { owner: 'A' },
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
    const b = await holding(pool, 'B');
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
    await pool.serve({ owner: 'A' }, create, async () => {});
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

  it('another owner and an unknown handle get the same answer: a fresh instance whose state is not available', async () => {
    const pool = new InstancePool<Fake>();
    const a = await holding(pool, 'A');
    const b = await holding(pool, 'B');
    const answers: string[] = [];
    for (const req of [
      { handle: a.stateHandle, owner: 'B' },
      { handle: b.stateHandle, owner: 'A' },
      { handle: a.stateHandle, owner: null },
      { handle: 'NOPE', owner: 'A' },
    ]) {
      await pool.serve(req, create, async (i) => {
        expect(i).not.toBe(a);
        expect(i).not.toBe(b);
        try {
          i.state.check(req.handle);
          answers.push('available');
        } catch (e) {
          answers.push((e as Error).message);
        }
      });
    }
    expect(answers).toEqual(Array(4).fill('state is not available'));
    expect(pool.size()).toBe(2);
    // The owners' own handles still route to their instances.
    let mine!: Fake;
    await pool.serve(
      { handle: b.stateHandle, owner: 'B' },
      create,
      async (i) => {
        mine = i;
      },
    );
    expect(mine).toBe(b);
  });

  it('a failed start on an instance that holds another kind releases only the failed slot', async () => {
    const pool = new InstancePool<Fake>();
    const held = await (async () => {
      let inst!: Fake;
      await pool.serve({ owner: 'A' }, create, async (i) => {
        inst = i;
        i.state.admit('abap');
        i.set(true);
      });
      return inst;
    })();
    await pool.serve(
      { handle: held.stateHandle, owner: 'A' },
      create,
      async (i) => {
        i.state.admit('amdp'); /* the start failed */
      },
    );
    expect((pool as any).slots.size).toBe(1);
    await pool.serve({ owner: 'A' }, create, async (i) => {
      expect(() => i.state.admit('amdp')).not.toThrow();
      expect(() => i.state.admit('abap')).toThrow(held.stateHandle);
    });
  });

  it('a request without an owner keeps nothing and takes no slot', async () => {
    const pool = new InstancePool<Fake>();
    let inst!: Fake;
    await pool.serve({ owner: null }, create, async (i) => {
      inst = i;
      expect(() => i.state.admit('abap')).toThrow();
      i.set(true);
    });
    expect(pool.size()).toBe(0);
    expect(inst.disposed).toBe(1);
    expect((pool as any).slots.size).toBe(0);
  });

  it('follows handle rotation: the old handle stops routing, the new one routes', async () => {
    const pool = new InstancePool<Fake>();
    const held = await holding(pool);
    const old = held.stateHandle;
    // A complete stop empties the instance (the handle rotates), and new state is created under the new handle.
    await pool.serve({ handle: old, owner: 'A' }, create, async (i) => {
      i.state.endWhenEmpty();
      i.set(false);
      i.set(true);
    });
    const rotated = held.stateHandle;
    expect(rotated).not.toBe(old);
    expect(pool.size()).toBe(1);
    expect([...(pool as any).index.keys()]).toEqual([rotated]);
    let viaOld!: Fake;
    await pool.serve({ handle: old, owner: 'A' }, create, async (i) => {
      viaOld = i;
    });
    expect(viaOld).not.toBe(held);
    expect(() => viaOld.state.check(old)).toThrow('state is not available');
    let viaNew!: Fake;
    await pool.serve({ handle: rotated, owner: 'A' }, create, async (i) => {
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
    await pool.serve({ handle: old, owner: 'A' }, create, async (i) => {
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
    const a = pool.serve({ handle: old, owner: 'A' }, create, async (i) => {
      await g.p;
      i.state.endWhenEmpty();
      i.set(false);
      i.set(true);
    });
    let second!: Fake;
    const b = pool.serve({ handle: old, owner: 'A' }, create, async (i) => {
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
      { handle: held.stateHandle, owner: 'A' },
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
    await expect(
      pool.serve({ owner: 'A' }, create, async () => {}),
    ).rejects.toThrow(PoolClosedError);
  });
});
