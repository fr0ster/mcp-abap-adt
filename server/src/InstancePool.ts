/**
 * Streamable HTTP keeps the MCP instance that holds state between calls.
 *
 * The transport is stateless — every request is an MCP session of its own —
 * and state lives in an instance (measured for the debugger: a continuous
 * poll, an attach within seconds, the attaching ABAP session; over RFC nothing
 * carries that session to another connection). So per request the host takes
 * an instance once: the one the request's `state_handle` names, when the owner
 * matches, or a new one. One request at a time per instance (the SDK binds one
 * transport). Slots hold the per-owner limit; a reservation in progress counts.
 * An instance that holds nothing is disposed once, after its work; a disposal
 * that fails keeps the instance for a retry. Nothing expires on a clock.
 *
 * The pool knows `InstanceState` and nothing of what the state is.
 */
import type {
  InstanceState,
  StateDescription,
  StateHost,
} from '@mcp-abap-adt/lib/state';

export interface Poolable {
  readonly state: InstanceState;
  readonly stateHandle: string;
  holdsState(): boolean;
  dispose(): Promise<void>;
}

export class BatchWithHandleError extends Error {
  constructor() {
    super('a JSON-RPC batch cannot carry state_handle');
    this.name = 'BatchWithHandleError';
  }
}

export class PoolClosedError extends Error {
  constructor() {
    super('the server is shutting down');
    this.name = 'PoolClosedError';
  }
}

interface JsonRpcCall {
  method?: unknown;
  params?: { arguments?: { state_handle?: unknown } };
}

/** The `state_handle` of a single `tools/call`; a batch carrying one is refused. */
export function handleOf(body: unknown): string | undefined {
  const one = (m: unknown): string | undefined => {
    const call = m as JsonRpcCall | null | undefined;
    const handle = call?.params?.arguments?.state_handle;
    return call?.method === 'tools/call' && typeof handle === 'string'
      ? handle
      : undefined;
  };
  if (Array.isArray(body)) {
    if (body.some((m) => one(m) !== undefined))
      throw new BatchWithHandleError();
    return undefined;
  }
  return one(body);
}

interface Held<T> {
  instance: T;
  owner: string;
  /** The handle the index files this entry under; follows rotation. */
  handle: string;
  /** The lease: requests on this instance queue here. */
  tail: Promise<unknown>;
  unsubscribe: () => void;
}

interface Slot<T> {
  instance: T;
  owner: string;
  kind: string;
  /** A start in progress: the slot holds before the kind is held. */
  pending: boolean;
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class InstancePool<T extends Poolable> {
  private readonly held = new Map<T, Held<T>>();
  /** handle → entry, kept in step with each instance's handle (`onChange`). */
  private readonly index = new Map<string, Held<T>>();
  private readonly slots = new Map<string, Slot<T>>();
  /** Requests working on an instance; no entry for an instance nobody works on. */
  private readonly busy = new Map<T, number>();
  private readonly subscribed = new WeakSet<object>();
  private readonly evicting = new Map<T, Promise<void>>();
  /** Disposal failed: the message. */
  private readonly failed = new Map<T, string>();
  /** Disposal failed or still finishing: owned for shutdown. */
  private readonly retained = new Set<T>();
  private readonly active = new Set<Promise<unknown>>();
  private admitting = true;

  size(): number {
    return this.held.size;
  }

  private slotKey(owner: string, kind: string): string {
    return JSON.stringify([owner, kind]);
  }

  private byHandle(handle: string): Held<T> | undefined {
    const entry = this.index.get(handle);
    // The index follows rotation; the check keeps a stale key from ever routing.
    return entry && entry.instance.stateHandle === handle ? entry : undefined;
  }

  private keep(instance: T, owner: string): void {
    if (this.held.has(instance)) return;
    const entry: Held<T> = {
      instance,
      owner,
      handle: instance.stateHandle,
      tail: Promise.resolve(),
      unsubscribe: () => {},
    };
    this.held.set(instance, entry);
    this.index.set(entry.handle, entry);
    entry.unsubscribe = instance.state.onChange(() => this.rekey(entry));
  }

  /** The handle rotated (a complete stop): the old one stops routing at once. */
  private rekey(entry: Held<T>): void {
    const now = entry.instance.stateHandle;
    if (now === entry.handle) return;
    if (this.index.get(entry.handle) === entry) this.index.delete(entry.handle);
    entry.handle = now;
    this.index.set(now, entry);
  }

  private drop(instance: T): void {
    const entry = this.held.get(instance);
    if (!entry) return;
    entry.unsubscribe();
    this.held.delete(instance);
    if (this.index.get(entry.handle) === entry) this.index.delete(entry.handle);
  }

  private releaseSlots(instance: T, keepKinds?: string[]): void {
    for (const [key, slot] of this.slots) {
      if (slot.instance !== instance) continue;
      if (keepKinds?.includes(slot.kind)) slot.pending = false;
      else this.slots.delete(key);
    }
  }

  private hostFor(owner: string | null, instance: T): StateHost {
    return {
      owner,
      reserve: (kind) => {
        if (owner === null) return undefined;
        const key = this.slotKey(owner, kind);
        const slot = this.slots.get(key);
        const occupied =
          slot &&
          slot.instance !== instance &&
          (slot.pending || slot.instance.state.kindsHeld().includes(kind));
        if (occupied) return slot.instance.stateHandle;
        this.slots.set(key, { instance, owner, kind, pending: true });
        return undefined;
      },
      peers: () => {
        const mine: Array<{
          state_handle: string;
          states: StateDescription[];
        }> = [];
        for (const e of this.held.values()) {
          if (e.owner === owner) mine.push(e.instance.state.describe());
        }
        if (!this.held.has(instance) && instance.holdsState()) {
          mine.push(instance.state.describe());
        }
        return mine;
      },
    };
  }

  async serve(
    request: { handle?: string; owner: string | null },
    create: () => T,
    work: (instance: T) => Promise<void>,
  ): Promise<void> {
    if (!this.admitting) throw new PoolClosedError();
    const run = this.route(request, create, work);
    this.active.add(run);
    try {
      await run;
    } finally {
      this.active.delete(run);
    }
  }

  private route(
    request: { handle?: string; owner: string | null },
    create: () => T,
    work: (instance: T) => Promise<void>,
  ): Promise<void> {
    const entry = request.handle ? this.byHandle(request.handle) : undefined;
    // An unknown handle and another owner's handle get the same: a new instance.
    if (!entry || entry.owner !== request.owner) {
      return this.run(create(), request.owner, work);
    }
    const turn = entry.tail.then(() =>
      // Revalidate: the instance may have left the pool, be leaving it, or
      // have rotated its handle while this request waited.
      this.held.get(entry.instance) === entry &&
      !this.evicting.has(entry.instance) &&
      entry.instance.stateHandle === request.handle
        ? this.run(entry.instance, request.owner, work)
        : this.run(create(), request.owner, work),
    );
    entry.tail = turn.catch(() => undefined);
    return turn;
  }

  private async run(
    instance: T,
    owner: string | null,
    work: (instance: T) => Promise<void>,
  ): Promise<void> {
    if (!this.subscribed.has(instance)) {
      this.subscribed.add(instance);
      instance.state.onEmpty(() => {
        if (!this.busy.get(instance)) void this.evict(instance);
      });
    }
    instance.state.host = this.hostFor(owner, instance);
    this.busy.set(instance, (this.busy.get(instance) ?? 0) + 1);
    try {
      await work(instance);
    } finally {
      const left = (this.busy.get(instance) ?? 1) - 1;
      if (left > 0) this.busy.set(instance, left);
      else this.busy.delete(instance);
      await this.settle(instance, owner);
    }
  }

  /** After a request: slots of kinds not held are released; what holds state is kept; the rest is disposed. */
  private async settle(instance: T, owner: string | null): Promise<void> {
    this.releaseSlots(instance, instance.state.kindsHeld());
    if (instance.holdsState() && owner !== null) {
      this.keep(instance, owner);
      return;
    }
    if (!this.busy.get(instance)) await this.evict(instance);
  }

  /**
   * Once at a time per instance: dispose it. It leaves the pool only when it
   * holds nothing afterwards — an asynchronous part may finish later, and
   * `onEmpty` calls this again then. A disposal that fails keeps the instance,
   * fresh or held, for a retry. The guard is set before disposing, so a part
   * that empties synchronously inside dispose() re-enters harmlessly.
   */
  private evict(instance: T): Promise<void> {
    const running = this.evicting.get(instance);
    if (running) return running;
    let done!: () => void;
    const eviction = new Promise<void>((resolve) => {
      done = resolve;
    });
    this.evicting.set(instance, eviction);
    void (async () => {
      try {
        await instance.dispose();
        this.failed.delete(instance);
        if (!instance.holdsState()) {
          this.drop(instance);
          this.retained.delete(instance);
          this.releaseSlots(instance);
        } else {
          this.retained.add(instance); // still finishing: owned until it empties
        }
      } catch (e) {
        this.failed.set(instance, `${instance.stateHandle}: ${messageOf(e)}`);
        this.retained.add(instance); // fresh or held: kept for a retry
      } finally {
        this.evicting.delete(instance);
        done();
      }
    })();
    return eviction;
  }

  /**
   * Stop admission; let running requests and disposals finish; dispose what is
   * held or retained; wait until each has settled (an asynchronous part
   * finishes when its last event arrives — no timer); retry once what still
   * holds; report what is still left.
   */
  async shutdown(): Promise<string[]> {
    this.admitting = false;
    await Promise.allSettled([...this.active]);
    await Promise.allSettled([...this.evicting.values()]);
    const owned = [...new Set<T>([...this.held.keys(), ...this.retained])];
    for (const instance of owned) await this.evict(instance);
    // Every instance settles first — a disposal that threw may still have
    // cleanup finishing on its own.
    await Promise.allSettled(owned.map((i) => i.state.settled()));
    for (const instance of owned) {
      this.failed.delete(instance);
      if (!instance.holdsState()) continue;
      await this.evict(instance); // what is still held after settling: once more
      await instance.state.settled();
      if (instance.holdsState() && !this.failed.has(instance)) {
        const left = instance.state.failures().join('; ');
        this.failed.set(
          instance,
          `${instance.stateHandle}: ${left || 'state is still held'}`,
        );
      }
    }
    return [...this.failed.values()];
  }
}
