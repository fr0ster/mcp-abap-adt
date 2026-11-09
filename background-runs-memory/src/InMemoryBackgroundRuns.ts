/**
 * The servers' background-run store: in the process's memory — a package of
 * its own, so a consumer of `@mcp-abap-adt/lib` that keeps runs elsewhere
 * never installs it. The launchers of `mcp-abap-adt`, `mcp-abap-adt-http`
 * and `mcp-abap-adt-sse` (and the compact binaries on them) create one and
 * hand it to their server instances; lib creates none — an embedder passes
 * this, its own strategy, or none (then a code run's `background: true` is
 * refused, and a listed long tool answers its result in the call).
 *
 * - **Handles**: 128 random bits as hex, after the host's `prefix` (an
 *   instance id, when the host routes handles between instances — the
 *   routing is the host's).
 * - **Ownership**: each run is its caller's (system, client, backend user);
 *   another caller's handle reads exactly as an unknown one.
 * - **Limit**: {@link BACKGROUND_RUNS_PER_CALLER} per caller, running plus
 *   kept; no process-wide limit.
 * - **State**: `running`; `finished`; `cancelled` — a kept answer carrying
 *   `cancelled: true` (a read run its caller cancelled).
 * - **No timeouts**: an ended run's answer stays until it is discarded (a
 *   read run's right after it was read, by the library); every answer ends
 *   with the process.
 */

import { randomBytes } from 'node:crypto';
import type {
  BackgroundRunAnswer,
  BackgroundRunCaller,
  BackgroundRunDiscarded,
  BackgroundRunListing,
  BackgroundRunRecord,
  BackgroundRunStart,
  BackgroundRunStarted,
  BackgroundRunState,
  IBackgroundRuns,
} from '@mcp-abap-adt/lib/embeddable';

/** Runs a caller may hold at once, running and kept (the user's number). */
export const BACKGROUND_RUNS_PER_CALLER = 16;

export interface InMemoryBackgroundRunsOptions {
  /** Put before every handle: the host's instance id, for its own routing. */
  prefix?: string;
}

interface Kept {
  owner: string;
  run: BackgroundRunStart;
  finished?: { at: string; answer: BackgroundRunAnswer };
}

function ownerKey(caller: BackgroundRunCaller): string {
  return JSON.stringify([caller.system, caller.client, caller.user]);
}

/** An ended run's state: `cancelled` when its answer says so. */
function endedState(
  answer: BackgroundRunAnswer,
): Exclude<BackgroundRunState, 'running'> {
  return answer.cancelled === true ? 'cancelled' : 'finished';
}

export class InMemoryBackgroundRuns implements IBackgroundRuns {
  private readonly prefix: string;
  /** By handle, in start order. */
  private readonly runs = new Map<string, Kept>();

  constructor(options: InMemoryBackgroundRunsOptions = {}) {
    this.prefix = options.prefix ?? '';
  }

  start(
    caller: BackgroundRunCaller,
    run: BackgroundRunStart,
  ): BackgroundRunStarted {
    const owner = ownerKey(caller);
    let held = 0;
    for (const kept of this.runs.values()) if (kept.owner === owner) held += 1;
    if (held >= BACKGROUND_RUNS_PER_CALLER) {
      return { refused: 'limit', limit: BACKGROUND_RUNS_PER_CALLER };
    }
    const handle = `${this.prefix}${randomBytes(16).toString('hex')}`;
    this.runs.set(handle, {
      owner,
      run: { tool: run.tool, object: run.object, started_at: run.started_at },
    });
    return { handle };
  }

  finish(
    handle: string,
    answer: BackgroundRunAnswer,
    finishedAt: string,
  ): void {
    const kept = this.runs.get(handle);
    if (kept === undefined || kept.finished !== undefined) return;
    kept.finished = { at: finishedAt, answer };
  }

  get(
    handle: string,
    caller: BackgroundRunCaller,
  ): BackgroundRunRecord | undefined {
    const kept = this.mine(handle, caller);
    if (kept === undefined) return undefined;
    if (kept.finished === undefined) {
      return { ...kept.run, run_handle: handle, state: 'running' };
    }
    return {
      ...kept.run,
      run_handle: handle,
      state: endedState(kept.finished.answer),
      finished_at: kept.finished.at,
      answer: kept.finished.answer,
    };
  }

  list(caller: BackgroundRunCaller): BackgroundRunListing[] {
    const owner = ownerKey(caller);
    const listed: BackgroundRunListing[] = [];
    for (const [handle, kept] of this.runs) {
      if (kept.owner !== owner) continue;
      listed.push(
        kept.finished === undefined
          ? { ...kept.run, run_handle: handle, state: 'running' }
          : {
              ...kept.run,
              run_handle: handle,
              state: endedState(kept.finished.answer),
              finished_at: kept.finished.at,
            },
      );
    }
    return listed;
  }

  discard(handle: string, caller: BackgroundRunCaller): BackgroundRunDiscarded {
    const kept = this.mine(handle, caller);
    if (kept === undefined) return 'not-available';
    if (kept.finished === undefined) return 'running';
    this.runs.delete(handle);
    return 'discarded';
  }

  /** The caller's run `handle`; `undefined` for an unknown handle and another caller's alike. */
  private mine(handle: string, caller: BackgroundRunCaller): Kept | undefined {
    const kept = this.runs.get(handle);
    return kept !== undefined && kept.owner === ownerKey(caller)
      ? kept
      : undefined;
  }
}
