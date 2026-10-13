/**
 * The program's shutdown, stdio (spec §6.4, D33, D51, D55). Installed by the
 * launcher only — the program, not the library — so an embedder's process is
 * never taken over.
 *
 * The first trigger — `SIGTERM`, `SIGINT`, stdin's `end` or `close` (one
 * start: the consumer closed the transport, M7) — starts one sequence, in
 * this order:
 *
 * 1. the registry's latch, in the trigger's tick: a call read from here on
 *    is answered with the shutdown refusal and reaches no tool — that is how
 *    the server stops taking input; the factory's `beginShutdown()`: no
 *    interactive login starts any more;
 * 2. **await the settlement of every registered tool** — none is aborted
 *    (D55): a started tool runs to its end, its requests still authorized
 *    with the credential held (the provider gate is open, a refresh
 *    included);
 * 3. **the instance close** (lib's `closeInstance`): the state undo (a
 *    debugger stop's requests are still authorized), then the terminal close
 *    — every connection the instance owns logged off whatever the undo
 *    answered —, then the MCP server; a leftover is a stderr line, exit `1`;
 * 4. `settle({ signal })`: the gate closes, the composed logins are
 *    disposed, the counted calls drain, every broker is flushed — no
 *    deadline of the server's choosing;
 * 5. exit `0`, or `1` with one stderr line per fact.
 *
 * Only a `SIGTERM` / `SIGINT` after the start, or `--shutdown-timeout` (no
 * default), ends the waiting early: the forced close (lib's
 * `shutdownSequence.ts`) — no further wait on a tool, the instance close or
 * a flush; every owned connection's logoff written; exit `1` naming what was
 * pending.
 *
 * Nothing is written to stdout (H3), and no line carries an error's message:
 * fixed words, a destination and auth-errors' reason only (H4).
 */

import { errorClassOf } from '@mcp-abap-adt/lib/auth';
import {
  type ClosableInstance,
  closeInstance,
  installShutdownSequence,
  type ShutdownProcess,
  settled,
} from '@mcp-abap-adt/lib/embeddable';
import type { SettleReport } from './auth/IAuthBrokerFactory.js';

export type { ShutdownProcess };

export interface ShutdownOptions {
  factory: {
    beginShutdown(): void;
    settle(options?: { signal?: AbortSignal }): Promise<SettleReport>;
  };
  /** The stdio instance: closed after its tools settled, before the gate. */
  instance: ClosableInstance;
  /** Whether the end of stdin is a trigger (stdio). */
  onStdinEnd?: boolean;
  exit: (code: number) => void;
  stderr: (line: string) => void;
  processLike: ShutdownProcess;
  /** `--shutdown-timeout` in milliseconds; absent: none. */
  shutdownTimeoutMs?: number | undefined;
}

/** The line of a state undo that left something. */
export function stateLeftLine(left: string): string {
  return `[MCP] State not undone at shutdown: ${left}`;
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
      step('the running tools');
      await settled();
      step('the instance close');
      for (const left of await closeInstance(instance)) {
        lines.push(stateLeftLine(left));
      }
      step('the session writes');
      try {
        const report = await factory.settle({ signal });
        for (const entry of report.notStored) lines.push(notStoredLine(entry));
      } catch (error) {
        lines.push(`[MCP] Shutdown did not settle: ${errorClassOf(error)}`);
      }
      return { lines };
    },
    onStdinEnd: options.onStdinEnd,
    exit: options.exit,
    stderr: options.stderr,
    processLike: options.processLike,
    shutdownTimeoutMs: options.shutdownTimeoutMs,
  });
}
