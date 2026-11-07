/**
 * What the three background-run tools ask of their server instance — the
 * instance's port, bound to one call: the host's strategy, the caller the
 * call's request resolved, and the instance's owner of its running runs.
 * `BaseMcpServer` fills it when its host gave a strategy (`backgroundRuns`);
 * a context without it answers "not available here".
 *
 * - **Every call is the caller's first:** `get`, and `discard`, ask the
 *   strategy for the caller's run before anything else; an unknown handle,
 *   someone else's and one that is not a handle at all get the same refusal,
 *   and nothing is sent.
 * - **A read run is answered once:** a finished or cancelled read run's
 *   answer is removed (the strategy's `discard`) right after `get` read it;
 *   a code run's stays until `discard`.
 * - **A discard of a running read cancels it** through the owner of the
 *   running runs (`owner.ts`: its run's one connection logged off, the
 *   cancelled answer kept); a running code run — or a read no owner this
 *   instance shares holds — is refused, nothing sent.
 */

import { ServerRefusal } from '../auth/serverRefusal';
import { isLongTool } from '../longTools';
import type {
  BackgroundRunCaller,
  BackgroundRunListing,
  BackgroundRunRecord,
  IBackgroundRuns,
} from './contract';
import type { BackgroundRunControl } from './run';

export interface BackgroundRunTools {
  /**
   * The caller's run; refused `background_run_not_available` otherwise. A
   * read run's ended answer is removed once read.
   */
  get(handle: unknown): Promise<BackgroundRunRecord>;
  /** The caller's runs, running, finished and cancelled; no output. */
  list(): Promise<BackgroundRunListing[]>;
  /**
   * Ends the caller's run: a running read is cancelled, an ended run's
   * answer removed; a running code run is refused.
   */
  discard(
    handle: unknown,
  ): Promise<{ run_handle: string; state: 'discarded' | 'cancelled' }>;
}

/** The owner of the running runs, by handle (`BackgroundRunOwner`). */
export interface BackgroundRunControls {
  control(handle: string): BackgroundRunControl | undefined;
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

/** Whether a run of `tool` is a read run: a listed long tool's. */
export function isReadRun(tool: string): boolean {
  return isLongTool(tool);
}

const NO_CONTROLS: BackgroundRunControls = { control: () => undefined };

/**
 * The port over `strategy` for the caller `caller()` resolves (asked once
 * per tool call), with the instance's running runs `controls`.
 */
export function backgroundRunTools(
  strategy: IBackgroundRuns,
  caller: () => Promise<BackgroundRunCaller>,
  controls: BackgroundRunControls = NO_CONTROLS,
): BackgroundRunTools {
  return {
    get: async (value) => {
      const who = await caller();
      const handle = asHandle(value);
      const record =
        handle === undefined ? undefined : await strategy.get(handle, who);
      if (record === undefined || handle === undefined) {
        throw new ServerRefusal('background_run_not_available');
      }
      if (record.state !== 'running' && isReadRun(record.tool)) {
        // Answered once: the read's kept answer goes now.
        await strategy.discard(handle, who);
      }
      return record;
    },
    list: async () => strategy.list(await caller()),
    discard: async (value) => {
      const who = await caller();
      const handle = asHandle(value);
      // The caller's run first: unknown and foreign alike, nothing sent.
      const record =
        handle === undefined ? undefined : await strategy.get(handle, who);
      if (record === undefined || handle === undefined) {
        throw new ServerRefusal('background_run_not_available');
      }
      if (record.state === 'running') {
        const control = controls.control(handle);
        if (!isReadRun(record.tool) || control?.kind !== 'read') {
          throw new ServerRefusal('background_run_running');
        }
        if ((await control.cancel()) === 'cancelled') {
          return { run_handle: handle, state: 'cancelled' };
        }
      }
      const outcome = await strategy.discard(handle, who);
      if (outcome === 'running') {
        throw new ServerRefusal('background_run_running');
      }
      if (outcome !== 'discarded') {
        throw new ServerRefusal('background_run_not_available');
      }
      return { run_handle: handle, state: 'discarded' };
    },
  };
}
