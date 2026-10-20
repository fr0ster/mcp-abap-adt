/**
 * Every temporary object the probe may have created, and the one cleanup that
 * removes them.
 *
 * An entry is added before the create is sent, not after it succeeds: a create
 * refused with 406 may still have created the object, so the removal itself
 * finds out whether there is anything to remove.
 */

import type { IRemoval } from './record';

export interface ILedgerEntry {
  label: string;
  /** Removes the object, or says it was never there. Throwing counts as not removed. */
  remove: () => Promise<{ removed: boolean; detail: string }>;
}

export class Ledger {
  private readonly entries: ILedgerEntry[] = [];
  private readonly settled = new Set<ILedgerEntry>();
  private readonly removals: IRemoval[] = [];
  private running?: Promise<IRemoval[]>;

  constructor(
    private readonly onRemoval: (removal: IRemoval) => void = () => {},
  ) {}

  add(entry: ILedgerEntry): void {
    this.entries.push(entry);
  }

  get size(): number {
    return this.entries.length;
  }

  /**
   * Removes every entry not removed yet, newest first (a function module
   * before its group), reports each, and answers every removal so far.
   *
   * An entry is tried once. One added while a cleanup runs is removed by that
   * cleanup; one added after it is removed by the next call. Calls queue
   * behind each other: a second call — Ctrl-C during the `finally` — waits
   * for the first, then removes whatever is left.
   */
  cleanup(): Promise<IRemoval[]> {
    const drain = async (): Promise<IRemoval[]> => {
      for (;;) {
        const pending = this.entries.filter(
          (entry) => !this.settled.has(entry),
        );
        if (!pending.length) return [...this.removals];
        for (const entry of pending.reverse()) {
          this.settled.add(entry);
          let removal: IRemoval;
          try {
            const outcome = await entry.remove();
            removal = { label: entry.label, ...outcome };
          } catch (error) {
            removal = {
              label: entry.label,
              removed: false,
              detail: `the removal threw: ${error instanceof Error ? error.message : String(error)}`,
            };
          }
          this.removals.push(removal);
          this.onRemoval(removal);
        }
      }
    };
    this.running = (this.running ?? Promise.resolve([])).then(drain, drain);
    return this.running;
  }
}

/** What a request refused after an interrupt throws. */
export class Interrupted extends Error {
  constructor() {
    super('interrupted (SIGINT)');
    this.name = 'Interrupted';
  }
}

/**
 * The stop signal of a run. After `stop()` no new request goes out: the next
 * one throws {@link Interrupted}, so the run unwinds once the request in
 * flight has answered, and its `finally` cleans up the ledger as it then
 * stands — the object that request created included.
 */
export class Interrupt {
  private stopped = false;

  stop(): void {
    this.stopped = true;
  }

  get requested(): boolean {
    return this.stopped;
  }

  /** Called before every request the run issues; throws once stopped. */
  check(): void {
    if (this.stopped) throw new Interrupted();
  }
}

/**
 * Runs `run` for each item in turn, asking the interrupt before each: after
 * Ctrl-C the item in flight finishes and no later one starts. Without an
 * interrupt (cleanup work) every item runs.
 */
export async function eachInTurn<T>(
  items: readonly T[],
  interrupt: Interrupt | undefined,
  run: (item: T, index: number) => Promise<unknown>,
): Promise<void> {
  for (const [index, item] of items.entries()) {
    interrupt?.check();
    await run(item, index);
  }
}

/**
 * Works under a lock already taken and releases it whatever happens — a
 * failure, an interrupt — before anything else runs. The release is cleanup:
 * `unlock` must not be stopped by the interrupt.
 */
export async function withLock<T>(
  handle: string,
  unlock: (handle: string) => Promise<unknown>,
  body: (handle: string) => Promise<T>,
): Promise<T> {
  try {
    return await body(handle);
  } finally {
    await unlock(handle);
  }
}

/** Runs `body`; the ledger is cleaned up whatever happens, failure included. */
export async function withCleanup<T>(
  ledger: Ledger,
  body: () => Promise<T>,
): Promise<T> {
  try {
    return await body();
  } finally {
    await ledger.cleanup();
  }
}
