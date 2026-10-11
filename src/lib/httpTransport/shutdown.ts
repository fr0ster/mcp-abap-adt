/**
 * The shutdown of an HTTP transport's program (http, sse): installed by the
 * launcher only — the program, not the library — so an embedder's process is
 * never taken over. `SIGTERM` and `SIGINT` run it once; later triggers wait
 * for the same run. The transport's `stop()` stops listening and drains what
 * it holds (http: the pool; sse: each connection's instance); then exit `0`,
 * or exit `1` with one stderr line in fixed words — never an error's message.
 * No timer. (A10 extends the sequence: latch, abort, settle.)
 */

import type { EventEmitter } from 'node:events';
import { errorClassOf } from '../auth/errors';

export interface TransportShutdownOptions {
  /** The transport's own stop. */
  stop: () => Promise<void>;
  exit: (code: number) => void;
  stderr: (line: string) => void;
  /** Where the triggers are listened for: `process` in the program. */
  processLike: EventEmitter;
}

/** Installs the triggers and answers the sequence, for a caller that shuts down for its own reason. */
export function installTransportShutdown(
  options: TransportShutdownOptions,
): () => Promise<void> {
  let running: Promise<void> | undefined;
  const sequence = async (): Promise<void> => {
    try {
      await options.stop();
    } catch (error) {
      options.stderr(
        `[MCP] The server did not stop cleanly at shutdown: ${errorClassOf(error)}`,
      );
      options.exit(1);
      return;
    }
    options.exit(0);
  };
  const run = (): Promise<void> => {
    running ??= sequence();
    return running;
  };
  const trigger = () => {
    void run();
  };
  options.processLike.on('SIGTERM', trigger);
  options.processLike.on('SIGINT', trigger);
  return run;
}
