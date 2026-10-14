/**
 * The program's shutdown, stdio (spec §6.4, D33). Installed by the launcher
 * only — the program, not the library — so an embedder's process is never
 * taken over.
 *
 * The first trigger — `SIGTERM`, `SIGINT`, stdin's `end` or `close` (one
 * start: the client closed the transport, M7) — starts one sequence, in
 * this order:
 *
 * 1. the registry's latch, in the trigger's tick: a call read from here on
 *    is answered with the shutdown refusal and reaches no tool — that is how
 *    the server stops taking input; the factory's `beginShutdown()`: no
 *    interactive login starts any more;
 * 2. **the logoffs at once** (lib's `logOffAtOnce`): every connection the
 *    process owns — the instance's connector, held state's (the debugger's),
 *    long reads' and lock sessions' fresh ones, background runs' — gets its
 *    logoff, which releases the locks, and every running call is
 *    interrupted; nothing waits for a running tool, and a queued call never
 *    sends. Held state ends with its connections: no state undo is sent;
 * 3. the MCP server closed;
 * 4. `settle({ signal })`: the gate closes, the composed logins are
 *    disposed, the counted calls drain, every broker is flushed — no
 *    deadline of the server's choosing; then the logoff of any connection
 *    opened meanwhile;
 * 5. exit `0`, or `1` with one stderr line per fact.
 *
 * Only a `SIGTERM` / `SIGINT` after the start, or `--shutdown-timeout` (no
 * default), ends the waiting early: the forced close (lib's
 * `shutdownSequence.ts`) — no further wait on the flush; every owned
 * connection's logoff written; exit `1` naming what was pending.
 *
 * Nothing is written to stdout (H3), and no line carries an error's message:
 * fixed words, a destination and auth-errors' reason only (H4).
 */

import { errorClassOf } from '@mcp-abap-adt/lib/auth';
import {
  installShutdownSequence,
  logOffAtOnce,
  type ShutdownProcess,
} from '@mcp-abap-adt/lib/state';
import type { SettleReport } from './auth/IAuthBrokerFactory.js';

export type { ShutdownProcess };

export interface ShutdownOptions {
  factory: {
    beginShutdown(): void;
    settle(options?: { signal?: AbortSignal }): Promise<SettleReport>;
  };
  /** The stdio instance: its MCP server closed after the logoffs, before the gate. */
  instance: { close(): Promise<void> };
  /** Whether the end of stdin is a trigger (stdio). */
  onStdinEnd?: boolean;
  exit: (code: number) => void;
  stderr: (line: string) => void;
  processLike: ShutdownProcess;
  /** `--shutdown-timeout` in milliseconds; absent: none. */
  shutdownTimeoutMs?: number | undefined;
}

/** The line of a session secret not stored. */
export function notStoredLine(entry: string): string {
  return `[MCP] Session secrets not stored: ${entry}`;
}

/**
 * Installs the triggers and answers the sequence itself, for a caller that
 * shuts down for its own reason. Every call answers the same run.
 */
export function installShutdown(options: ShutdownOptions): () => Promise<void> {
  const { factory, instance } = options;
  return installShutdownSequence({
    begin: () => factory.beginShutdown(),
    run: async (step, signal) => {
      const lines: string[] = [];
      step('the logoffs');
      await logOffAtOnce();
      step('the instance close');
      try {
        await instance.close();
      } catch {
        // The MCP server's own close: its transport is gone either way.
      }
      step('the session writes');
      try {
        const report = await factory.settle({ signal });
        for (const entry of report.notStored) lines.push(notStoredLine(entry));
      } catch (error) {
        lines.push(`[MCP] Shutdown did not settle: ${errorClassOf(error)}`);
      }
      // A connection opened while the writes settled is logged off too.
      await logOffAtOnce();
      return { lines };
    },
    onStdinEnd: options.onStdinEnd,
    exit: options.exit,
    stderr: options.stderr,
    processLike: options.processLike,
    shutdownTimeoutMs: options.shutdownTimeoutMs,
  });
}
