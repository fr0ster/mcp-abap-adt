/**
 * The shutdown of an HTTP transport's program — http and sse, one sequence
 * (spec §3.7, §6.4, D50, D55): installed by the launcher only, so an
 * embedder's process is never taken over.
 *
 * On the first `SIGTERM` / `SIGINT`: the process latch (in that tick — no
 * call is admitted from here on) and the transport's own `begin` (http: the
 * pool stops admitting, `503`), then stop listening; **await the settlement of
 * every registered tool**, across every instance — none aborted (D55): a
 * started tool runs to its end —; then the transport's last step (http: the
 * pool's shutdown; sse: the instance close of every open connection), each
 * instance's connections closed with a logoff; exit `0`, or `1` with one
 * stderr line per leftover. No deadline: a later `SIGTERM` / `SIGINT`, or
 * `--shutdown-timeout`, switches to the forced close (lib's
 * `shutdownSequence.ts`): the last step is not awaited, every owned
 * connection's logoff is written, exit `1` naming the requests still running.
 * Nothing is persisted, so nothing is flushed.
 */

import type { EventEmitter } from 'node:events';
import { settled } from '../activeTools';
import { errorClassOf } from '../auth/errors';
import { installShutdownSequence } from '../shutdownSequence';

export interface TransportShutdownOptions {
  /** Synchronous, in the trigger's tick: the transport stops admitting (http: the pool's `503`). */
  begin?: () => void;
  /** Stops listening: no new connection. */
  stopListening: () => void;
  /**
   * The transport's last step, after every tool settled: disposes every
   * instance (its connections closed with a logoff) and answers one line per
   * leftover, in fixed words.
   */
  lastStep: () => Promise<string[]>;
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
      step('the running tools');
      await settled();
      step('closing the instances');
      try {
        return { lines: await options.lastStep() };
      } catch (error) {
        return {
          lines: [
            `[MCP] The server did not stop cleanly at shutdown: ${errorClassOf(error)}`,
          ],
        };
      }
    },
    exit: options.exit,
    stderr: options.stderr,
    processLike: options.processLike,
    shutdownTimeoutMs: options.shutdownTimeoutMs,
  });
}
