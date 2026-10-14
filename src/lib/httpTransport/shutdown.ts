/**
 * The shutdown of an HTTP transport's program — http and sse, one sequence
 * (spec §3.7, §6.4, D50): installed by the launcher only, so an embedder's
 * process is never taken over.
 *
 * On the first `SIGTERM` / `SIGINT`: the process latch (in that tick — no
 * call is admitted from here on) and the transport's own `begin` (http: the
 * pool stops admitting, `503`), then stop listening; then **the logoffs at
 * once** (lib's `logOffAtOnce`): every connection the process owns — every
 * instance's connector, held state's, long reads', lock sessions',
 * background runs' — gets its logoff, which releases the locks, and every
 * running call is interrupted; nothing waits for a running tool, a queued
 * call never sends, and held state ends with its connections (no state undo
 * is sent). Then `release`: the client connections left on the stopped
 * listener are closed; exit `0`. A later `SIGTERM` / `SIGINT`, or
 * `--shutdown-timeout`, switches to the forced close (lib's
 * `shutdownSequence.ts`): exit `1` naming what was still pending. Nothing is
 * persisted, so nothing is flushed.
 */

import type { EventEmitter } from 'node:events';
import { installShutdownSequence, logOffAtOnce } from '../shutdownSequence';

export interface TransportShutdownOptions {
  /** Synchronous, in the trigger's tick: the transport stops admitting (http: the pool's `503`). */
  begin?: () => void;
  /** Stops listening: no new connection. */
  stopListening: () => void;
  /**
   * After the logoffs, synchronous: the client connections still open on
   * the stopped listener are closed, so none keeps the process alive.
   */
  release?: () => void;
  exit: (code: number) => void;
  stderr: (line: string) => void;
  /** Where the triggers are listened for: `process` in the program. */
  processLike: EventEmitter;
  /** `--shutdown-timeout` in milliseconds; absent: none. */
  shutdownTimeoutMs?: number | undefined;
}

/** Installs the triggers and answers the sequence, for a caller that shuts down for its own reason. */
export function installTransportShutdown(
  options: TransportShutdownOptions,
): () => Promise<void> {
  return installShutdownSequence({
    begin: () => {
      options.begin?.();
      options.stopListening();
    },
    run: async (step) => {
      step('the logoffs');
      await logOffAtOnce();
      options.release?.();
      return { lines: [] };
    },
    exit: options.exit,
    stderr: options.stderr,
    processLike: options.processLike,
    shutdownTimeoutMs: options.shutdownTimeoutMs,
  });
}
