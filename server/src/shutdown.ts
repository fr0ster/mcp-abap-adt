/**
 * The program's shutdown (spec §7). Installed by the launcher only — the
 * program, not the library — so an embedder's process is never taken over.
 *
 * Triggers: `SIGTERM`, `SIGINT` and, for stdio, the end of stdin (the client
 * went away). The first trigger runs the sequence; later ones wait for it:
 *
 * 1. `close()` every server: HTTP and SSE stop accepting connections. That
 *    does not stop requests already running — the gate in step 2 is what holds;
 * 2. `settle(30_000)`: the factory closes its provider gate, waits for the
 *    provider calls already running, then flushes every broker;
 * 3. exit `0` when everything is stored and nothing was abandoned; otherwise
 *    one stderr line per fact, and exit `1`.
 *
 * Nothing is written to stdout (H3), and no line carries an error's message:
 * a class name, a destination and a count only (H4).
 */

import type { EventEmitter } from 'node:events';
import { errorClassOf, type SettleReport } from '@mcp-abap-adt/lib/auth';

/** The callback strategy's login timeout: a login waiting on a browser ends by then. */
export const SHUTDOWN_DEADLINE_MS = 30_000;

export interface Closable {
  close(): Promise<void> | void;
}

/** What the shutdown listens on: the process, or a test's stand-in. */
export type ShutdownProcess = EventEmitter & { stdin?: EventEmitter };

export interface ShutdownOptions {
  factory: { settle(deadlineMs: number): Promise<SettleReport> };
  servers: Closable[];
  /** Whether the end of stdin is a trigger (stdio). */
  onStdinEnd?: boolean;
  exit: (code: number) => void;
  stderr: (line: string) => void;
  processLike: ShutdownProcess;
}

function abandonedLine(count: number): string {
  return count === 1
    ? '[MCP] 1 authorization still running at shutdown, its result is lost'
    : `[MCP] ${count} authorizations still running at shutdown, their results are lost`;
}

/**
 * Installs the triggers and answers the sequence itself, for a caller that
 * shuts down for its own reason. Every call answers the same run.
 */
export function installShutdown(options: ShutdownOptions): () => Promise<void> {
  const { factory, servers, exit, stderr, processLike } = options;
  let running: Promise<void> | undefined;

  const sequence = async (): Promise<void> => {
    let failed = false;
    await Promise.all(
      servers.map(async (server) => {
        try {
          await server.close();
        } catch (error) {
          failed = true;
          stderr(
            `[MCP] A server did not close at shutdown: ${errorClassOf(error)}`,
          );
        }
      }),
    );
    try {
      const report = await factory.settle(SHUTDOWN_DEADLINE_MS);
      for (const entry of report.notStored) {
        stderr(`[MCP] Session secrets not stored: ${entry}`);
      }
      if (report.abandoned > 0) stderr(abandonedLine(report.abandoned));
      if (report.notStored.length > 0 || report.abandoned > 0) failed = true;
    } catch (error) {
      failed = true;
      stderr(`[MCP] Shutdown did not settle: ${errorClassOf(error)}`);
    }
    exit(failed ? 1 : 0);
  };

  const run = (): Promise<void> => {
    running ??= sequence();
    return running;
  };
  const trigger = () => {
    void run();
  };

  processLike.on('SIGTERM', trigger);
  processLike.on('SIGINT', trigger);
  if (options.onStdinEnd) {
    processLike.stdin?.on('end', trigger);
    processLike.stdin?.on('close', trigger);
  }
  return run;
}
