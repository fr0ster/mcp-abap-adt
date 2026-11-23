/**
 * The runner's stop request as an abort signal: the live suites' stop file
 * (`MCP_ABAP_ADT_STOP_FILE`, written by `tools/run-tests.mjs` on the first
 * interrupt), polled for its state.
 *
 * Here, beside the shared test helpers and outside the live roots: the poll
 * is no bound, delay or poll limit on a live step (`noLiveBounds.test.ts`) —
 * it ends nothing on its own clock, only reads the runner's file.
 */

import { existsSync } from 'node:fs';

/** How often the stop file is polled: short, and the poll keeps no process alive. */
export const STOP_POLL_MS = 100;

/**
 * A signal the runner's stop request aborts (its stop file, `file`, written
 * on the first interrupt): checked once at once, then every
 * `STOP_POLL_MS` by an unreferenced interval, aborted the first time the
 * file is there. A state poll has no baseline, so it misses no file, unlike
 * change detection (`fs.watch` rides FSEvents on macOS, `fs.watchFile`
 * takes its first stat asynchronously). The abort and `close` clear the
 * interval. Without a stop file the signal never aborts.
 */
export function stopSignalOf(file: string | undefined): {
  readonly signal: AbortSignal;
  close(): void;
} {
  const controller = new AbortController();
  if (file === undefined || file === '') {
    return { signal: controller.signal, close: () => {} };
  }
  let poll: ReturnType<typeof setInterval> | undefined;
  const check = () => {
    if (controller.signal.aborted || !existsSync(file)) return;
    clearInterval(poll);
    controller.abort();
  };
  check();
  if (controller.signal.aborted) {
    return { signal: controller.signal, close: () => {} };
  }
  poll = setInterval(check, STOP_POLL_MS);
  poll.unref();
  return { signal: controller.signal, close: () => clearInterval(poll) };
}
