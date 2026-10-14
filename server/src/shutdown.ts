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
 * 5. exit `0`, or `1` with one stderr line per fact. A shutdown that began
 *    before the transport opened (`startBirth`: the connector still being
 *    born) waits for the start to end after the logoffs and exits `1` — the
 *    start failed; it is the process's one exit.
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
  /**
   * The start: whether the transport opened. A shutdown before it ends the
   * start and exits `1` (`startBirth`); absent: the transport is open.
   */
  birth?: StartBirth | undefined;
}

/** The line of a shutdown that came before the transport opened. */
export const SHUTDOWN_BEFORE_START_LINE =
  '[MCP] The shutdown began before the server started: the start failed';

/**
 * The start as the shutdown sees it: the connector's birth, then the
 * transport's opening. The launcher hands its birth over (`joining`) and
 * asks, once the birth settled, whether it may still open the transport
 * (`open`) — `false` once the shutdown began. A shutdown that began before
 * the transport opened waits for the birth to settle (its logoffs at once
 * end it), then exits `1`: the start failed. The launcher then exits
 * nothing itself (`shutdownBegan`): the shutdown's exit is the process's
 * one exit.
 */
export interface StartBirth {
  /** Whether the shutdown began. */
  shutdownBegan(): boolean;
  /** The birth under way; the shutdown joins it. */
  joining<T>(birth: Promise<T>): Promise<T>;
  /** The transport opens now — `false` (nothing opened) once the shutdown began. */
  open(): boolean;
}

/** The shutdown's side of a start (`StartBirth`). */
interface StartBirthState extends StartBirth {
  /** In the trigger's tick. */
  began(): void;
  /** Whether the transport opened. */
  opened(): boolean;
  /** Settles once the birth handed over settled (or at once: none). */
  settled(): Promise<void>;
}

/** A new start, not yet opened. */
export function startBirth(): StartBirth {
  let began = false;
  let opened = false;
  let birth: Promise<unknown> = Promise.resolve();
  const state: StartBirthState = {
    shutdownBegan: () => began,
    joining: (pending) => {
      birth = pending;
      return pending;
    },
    open: () => {
      if (began) return false;
      opened = true;
      return true;
    },
    began: () => {
      began = true;
    },
    opened: () => opened,
    settled: () =>
      birth.then(
        () => undefined,
        () => undefined,
      ),
  };
  return state;
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
  const birth = options.birth as StartBirthState | undefined;
  return installShutdownSequence({
    begin: () => {
      birth?.began();
      factory.beginShutdown();
    },
    run: async (step, signal) => {
      const lines: string[] = [];
      // Read in the trigger's turn: the transport cannot open after it.
      const beforeStart = birth !== undefined && !birth.opened();
      step('the logoffs');
      await logOffAtOnce();
      if (beforeStart) {
        // The start ends with the logoffs; its own failure line first.
        step('the start');
        await birth.settled();
        lines.push(SHUTDOWN_BEFORE_START_LINE);
      }
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
