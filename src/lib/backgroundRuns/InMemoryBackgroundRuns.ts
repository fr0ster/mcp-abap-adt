/**
 * The servers' background-run store: in the process's memory. The launchers
 * of `mcp-abap-adt`, `mcp-abap-adt-http` and `mcp-abap-adt-sse` (and the
 * compact binaries on them) create one and hand it to their server
 * instances; nothing creates one by default — an embedder passes its own
 * strategy, or none (then `background: true` is refused).
 *
 * - **Handles**: 128 random bits as hex, after the host's `prefix` (an
 *   instance id, when the host routes handles between instances — the
 *   routing is the host's).
 * - **Ownership**: each run is its caller's (URL, client, backend user);
 *   another caller's handle reads exactly as an unknown one.
 * - **Limit**: {@link BACKGROUND_RUNS_PER_CALLER} per caller, running plus
 *   kept; no process-wide limit.
 * - **No timeouts**: a finished run's answer stays until its caller discards
 *   it; every answer ends with the process.
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
  IBackgroundRuns,
} from './contract';

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
  return JSON.stringify([caller.url, caller.client, caller.user]);
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
      state: 'finished',
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
              state: 'finished',
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
