/**
 * What the three background-run tools ask of their server instance — the
 * instance's port, bound to one call: the host's strategy, and the caller
 * the call's request resolved. `BaseMcpServer` fills it when its host gave a
 * strategy (`backgroundRuns`); a context without it answers "not available
 * here".
 */

import { ServerRefusal } from '../auth/serverRefusal';
import type {
  BackgroundRunCaller,
  BackgroundRunListing,
  BackgroundRunRecord,
  IBackgroundRuns,
} from './contract';

export interface BackgroundRunTools {
  /** The caller's run; refused `background_run_not_available` otherwise. */
  get(handle: unknown): Promise<BackgroundRunRecord>;
  /** The caller's runs, running and finished; no output. */
  list(): Promise<BackgroundRunListing[]>;
  /** Removes the caller's finished run; a running one is refused. */
  discard(handle: unknown): Promise<{ run_handle: string; state: 'discarded' }>;
}

/** The longest handle passed to a strategy: anything longer names no run. */
const MAX_HANDLE = 512;

function asHandle(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_HANDLE
    ? value
    : undefined;
}

/**
 * The port over `strategy` for the caller `caller()` resolves (asked once
 * per tool call). An unknown handle, someone else's and one that is not a
 * handle at all get the same refusal.
 */
export function backgroundRunTools(
  strategy: IBackgroundRuns,
  caller: () => Promise<BackgroundRunCaller>,
): BackgroundRunTools {
  return {
    get: async (value) => {
      const who = await caller();
      const handle = asHandle(value);
      const record =
        handle === undefined ? undefined : await strategy.get(handle, who);
      if (record === undefined) {
        throw new ServerRefusal('background_run_not_available');
      }
      return record;
    },
    list: async () => strategy.list(await caller()),
    discard: async (value) => {
      const who = await caller();
      const handle = asHandle(value);
      const outcome =
        handle === undefined
          ? 'not-available'
          : await strategy.discard(handle, who);
      if (outcome === 'running') {
        throw new ServerRefusal('background_run_running');
      }
      if (outcome !== 'discarded' || handle === undefined) {
        throw new ServerRefusal('background_run_not_available');
      }
      return { run_handle: handle, state: 'discarded' };
    },
  };
}
