/**
 * Streamable HTTP keeps the MCP instance that holds state between calls.
 *
 * The transport is stateless — every request is an MCP session of its own —
 * and state lives in an instance (measured for the debugger: a continuous
 * poll, an attach within seconds, the attaching ABAP session; over RFC nothing
 * carries that session to another connection). So per request the host takes
 * an instance once: the one the request's handle names (the
 * `x-mcp-state-handle` header, else the `tools/call`'s `state_handle`), or a
 * new one.
 * The handle identifies an LLM session's state and is a bearer secret:
 * whoever holds it reaches the instance, like a session cookie; keeping it
 * safe is the deployer's. There is no owner and no limit of ours: two
 * listeners of one SAP user meet as SAP answers them (see the debugger's
 * `ids.ts`). One request at a time per instance (the SDK binds one
 * transport).
 * An instance that holds nothing is disposed once, after its work; a disposal
 * that fails keeps the instance for a retry. An instance whose close was asked
 * (a long session's close) leaves when that call settles — after its answer
 * was written —: out of the index and, in the same tick, its instance close
 * started (`instanceClose`), which runs on outside the routing; the shutdown
 * awaits it. The pool keeps no clock: the
 * idle bound is the instance state's own (`InstanceState`), and an instance it
 * empties leaves through `onEmpty` like any other.
 *
 * The pool knows `InstanceState` and nothing of what the state is.
 */
import type { IncomingHttpHeaders } from 'node:http';
import { errorClassOf, failureOf } from '@mcp-abap-adt/lib/auth';
import {
  type InstanceState,
  StateUnavailableError,
} from '@mcp-abap-adt/lib/state';

export interface Poolable {
  readonly state: InstanceState;
  readonly stateHandle: string;
  holdsState(): boolean;
  /** The state undo: callable again, each call retrying what is left. */
  dispose(): Promise<void>;
  /**
   * The terminal close: every connection the instance owns
   * closed with a logoff. Run when the instance leaves the pool, after its
   * undo, whatever the undo answered.
   */
  terminalClose?(): Promise<void>;
  /**
   * Whether the instance's close was asked during its work (a long
   * session's close): the pool then closes it instead of keeping it.
   */
  closeAsked?(): boolean;
  /**
   * The instance close (lib's `closeInstance`): the instance latched, every
   * connection it owns logged off — awaited to each logoff's answer —, an
   * open batch dropped, the state let go, the MCP server closed. Started
   * synchronously; never rejects.
   */
  instanceClose?(): Promise<void>;
}

/** The `400` words of a batch carrying `state_handle`. */
export const BATCH_WITH_HANDLE_WORDS =
  'a JSON-RPC batch cannot carry state_handle';

/** The `503` words of a request after the shutdown began. */
export const POOL_CLOSED_WORDS = 'the server is shutting down';

export class BatchWithHandleError extends Error {
  constructor() {
    super(BATCH_WITH_HANDLE_WORDS);
    this.name = 'BatchWithHandleError';
  }
}

export class PoolClosedError extends Error {
  constructor() {
    super(POOL_CLOSED_WORDS);
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

/** The request header that carries the handle on Streamable HTTP. */
export const STATE_HANDLE_HEADER = 'x-mcp-state-handle';

/**
 * The handle a request routes by: the `x-mcp-state-handle` header first, else
 * the `state_handle` of a single `tools/call` (`handleOf`; the debugger tools
 * keep their argument). A JSON-RPC batch carrying `state_handle` is refused
 * whether or not the header is there. A header that is not one non-empty
 * value is absent.
 */
export function handleFrom(
  headers: IncomingHttpHeaders,
  body: unknown,
): string | undefined {
  const argument = handleOf(body);
  const header = headers[STATE_HANDLE_HEADER];
  return typeof header === 'string' && header !== '' ? header : argument;
}

interface Held<T> {
  instance: T;
  /** The handle the index files this entry under; follows rotation. */
  handle: string;
  /** The lease: requests on this instance queue here. */
  tail: Promise<unknown>;
  unsubscribe: () => void;
}

/**
 * What a failed undo is reported as: the state's own words of what it could
 * not undo (`StateCleanupError.failures`, the parts' fixed words), else what
 * the failure reader makes of it, else its class — never a thrown message.
 */
const failureWordsOf = (e: unknown): string => {
  const failures = ownFailures(e);
  if (failures !== undefined) return failures.join('; ');
  return failureOf(e)?.message ?? errorClassOf(e);
};

function ownFailures(e: unknown): string[] | undefined {
  if (e === null || typeof e !== 'object') return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(e, 'failures');
    const value =
      descriptor && 'value' in descriptor ? descriptor.value : undefined;
    return Array.isArray(value) && value.every((f) => typeof f === 'string')
      ? (value as string[])
      : undefined;
  } catch {
    return undefined;
  }
}

export class InstancePool<T extends Poolable> {
  private readonly held = new Map<T, Held<T>>();
  /** handle → entry, kept in step with each instance's handle (`onChange`). */
  private readonly index = new Map<string, Held<T>>();
  /** Requests working on an instance; no entry for an instance nobody works on. */
  private readonly busy = new Map<T, number>();
  private readonly subscribed = new WeakSet<object>();
  private readonly evicting = new Map<T, Promise<void>>();
  /** Disposal failed: the message. */
  private readonly failed = new Map<T, string>();
  /** Disposal failed or still finishing: owned for shutdown. */
  private readonly retained = new Set<T>();
  private readonly active = new Set<Promise<unknown>>();
  /** Instance closes the pool started and that still run: the shutdown awaits them. */
  private readonly closing = new Set<Promise<void>>();
  private admitting = true;
  /** Instances whose terminal close ran: they left the pool for good. */
  private readonly closed = new WeakSet<T>();
  /**
   * What a failure is named by: an ordinal per instance. Never the handle — it
   * is a bearer secret, and these lines reach the log at shutdown.
   */
  private readonly ordinals = new WeakMap<T, number>();
  private nextOrdinal = 1;

  private nameOf(instance: T): string {
    let n = this.ordinals.get(instance);
    if (n === undefined) {
      n = this.nextOrdinal++;
      this.ordinals.set(instance, n);
    }
    return `instance ${n}`;
  }

  /** Whether a handle is filed in the index: an instance's state draws again when so. */
  isHandleTaken = (handle: string): boolean => this.index.has(handle);

  size(): number {
    return this.held.size;
  }

  private byHandle(handle: string): Held<T> | undefined {
    const entry = this.index.get(handle);
    // The index follows rotation; the check keeps a stale key from ever routing.
    return entry && entry.instance.stateHandle === handle ? entry : undefined;
  }

  private keep(instance: T): void {
    if (this.held.has(instance)) return;
    const entry: Held<T> = {
      instance,
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

  /**
   * `refuseUnknown` (a tool call): a handle that names no instance in the
   * pool — never one, or one whose state ended — is refused here with
   * `StateUnavailableError`, before any instance is made or anything logs
   * on; the answer is the same whatever the handle was. Without a handle, a
   * new instance as ever.
   */
  async serve(
    request: { handle?: string; refuseUnknown?: boolean },
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
    request: { handle?: string; refuseUnknown?: boolean },
    create: () => T,
    work: (instance: T) => Promise<void>,
  ): Promise<void> {
    const entry = request.handle ? this.byHandle(request.handle) : undefined;
    // The handle is a bearer secret: it reaches its instance whoever sends it.
    // An unknown handle on a tool call is not available, answered here; on any
    // other request (initialize, a list) it gets a new instance, which logs on
    // nowhere until a tool call.
    if (!entry) {
      if (request.handle && request.refuseUnknown)
        return Promise.reject(new StateUnavailableError());
      return this.run(create(), work);
    }
    const turn = entry.tail.then(() =>
      // Revalidate: the instance may have left the pool, be leaving it, or
      // have rotated its handle while this request waited.
      this.held.get(entry.instance) === entry &&
      !this.evicting.has(entry.instance) &&
      entry.instance.stateHandle === request.handle
        ? this.run(entry.instance, work)
        : request.refuseUnknown
          ? Promise.reject(new StateUnavailableError())
          : this.run(create(), work),
    );
    entry.tail = turn.catch(() => undefined);
    return turn;
  }

  private async run(
    instance: T,
    work: (instance: T) => Promise<void>,
  ): Promise<void> {
    if (!this.subscribed.has(instance)) {
      this.subscribed.add(instance);
      instance.state.onEmpty(() => {
        if (!this.busy.get(instance)) void this.evict(instance);
      });
    }
    this.busy.set(instance, (this.busy.get(instance) ?? 0) + 1);
    try {
      await work(instance);
    } finally {
      const left = (this.busy.get(instance) ?? 1) - 1;
      if (left > 0) this.busy.set(instance, left);
      else this.busy.delete(instance);
      await this.settle(instance);
    }
  }

  /**
   * After a request: an instance whose close was asked is closed; what holds
   * state is kept; the rest is disposed.
   */
  private async settle(instance: T): Promise<void> {
    if (instance.closeAsked?.() && instance.instanceClose) {
      this.closeOut(instance);
      return;
    }
    if (instance.holdsState()) {
      this.keep(instance);
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
          // It left the pool: its connections end with a logoff.
          await this.terminalClose(instance);
        } else {
          this.retained.add(instance); // still finishing: owned until it empties
        }
      } catch (e) {
        this.failed.set(
          instance,
          `${this.nameOf(instance)}: ${failureWordsOf(e)}`,
        );
        this.retained.add(instance); // fresh or held: kept for shutdown's retry
        if (!instance.holdsState()) {
          // Nothing left to route to: out of the index and the count; only
          // `retained` keeps it, for the retry.
          this.drop(instance);
        }
      } finally {
        this.evicting.delete(instance);
        done();
      }
    })();
    return eviction;
  }

  /**
   * The close asked of an instance, once its call settled (its answer
   * written): in one tick it leaves the index — a call carrying its handle
   * is answered `state is not available` from here on, one queued behind
   * the close included — and its instance close starts. Not awaited here:
   * the close runs on outside the routing, its logoffs' answers awaited
   * with no timer; the shutdown awaits it (`closing`). It owns what it
   * closes: no disposal and no terminal close of the pool's follow.
   */
  private closeOut(instance: T): void {
    if (this.closed.has(instance) || !instance.instanceClose) return;
    this.drop(instance);
    this.retained.delete(instance);
    this.failed.delete(instance);
    // Closed: when the batch was the only thing held, the close's
    // `dropBatch` empties the state and `onEmpty` evicts the instance —
    // `dispose()` on a latched instance whose parts hold nothing, then the
    // terminal close skipped (closed here). Harmless: nothing else to undo.
    this.closed.add(instance);
    const closing = instance.instanceClose().catch(() => undefined);
    this.closing.add(closing);
    void closing.finally(() => this.closing.delete(closing));
  }

  /** The terminal close of an instance leaving the pool, once. */
  private async terminalClose(instance: T): Promise<void> {
    if (this.closed.has(instance)) return;
    this.closed.add(instance);
    await instance.terminalClose?.();
  }

  /** Stops admission (shutdown, in the latch's tick): every later request is `503`. */
  stopAdmitting(): void {
    this.admitting = false;
  }

  /**
   * Stop admission; let running requests and disposals finish; dispose what is
   * held or retained; wait until each has settled (an asynchronous part
   * finishes when its last event arrives — no timer); retry once what still
   * holds; report what is still left. Every instance it owned then leaves the
   * pool through its terminal close — its connections closed with a logoff
   * whatever its undo answered. An instance close the pool started (a long
   * session's close) is awaited to its end: its logoffs answered.
   */
  async shutdown(): Promise<string[]> {
    this.admitting = false;
    await Promise.allSettled([...this.active]);
    await Promise.allSettled([...this.closing]);
    await Promise.allSettled([...this.evicting.values()]);
    const owned = [...new Set<T>([...this.held.keys(), ...this.retained])];
    for (const instance of owned) await this.evict(instance);
    // Every instance settles first — a disposal that threw may still have
    // cleanup finishing on its own.
    await Promise.allSettled(owned.map((i) => i.state.settled()));
    for (const instance of owned) {
      // Clean: nothing held and no failure left (a later eviction cleared it).
      if (!instance.holdsState() && !this.failed.has(instance)) continue;
      this.failed.delete(instance);
      // Still held, or a disposal that threw: once more, and what that leaves is reported.
      await this.evict(instance);
      await instance.state.settled();
      if (instance.holdsState() && !this.failed.has(instance)) {
        const left = instance.state.failures().join('; ');
        this.failed.set(
          instance,
          `${this.nameOf(instance)}: ${left || 'state is still held'}`,
        );
      }
    }
    // Leaving for good: the logoffs are written whatever the undo answered.
    await Promise.all(owned.map((instance) => this.terminalClose(instance)));
    return [...this.failed.values()];
  }
}
