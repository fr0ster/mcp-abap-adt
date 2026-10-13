/**
 * The shutdown of a program — core's, http's and sse's launchers (spec §6.4,
 * D33, D55): installed by the launcher only, so an embedder's process is
 * never taken over.
 *
 * **What starts it.** The first trigger — `SIGTERM`, `SIGINT`, and for stdio
 * the end of stdin (`end` and `close` alike: one start, M7) — starts one
 * sequence. In that tick the process latch is set (`latch()`), before
 * anything else: a call arriving from here on is refused before any
 * connection. Then the program's own `begin` (stop listening, stop the pool's
 * admission, stop taking input) and its orderly `run` (await every
 * registered tool — none aborted —, then its last steps). No deadline: the
 * sequence takes as long as its steps do.
 *
 * **The forced close.** Only a `SIGTERM` / `SIGINT` after the start, or
 * `--shutdown-timeout` (no default), ends the waiting early: no further wait
 * on a tool, an instance close, a state undo or a flush — every connection
 * the process owns is logged off (`forceClose`, awaited only to each logoff's
 * write), and the exit is `1` with one stderr line per fact still pending:
 * each tool still running, and the step the orderly sequence was in.
 *
 * Nothing is written to stdout, and no line carries an error's message.
 */

import type { EventEmitter } from 'node:events';
import { latch, pending } from './activeTools';
import { forceClose } from './ownedConnections';

/** What the shutdown listens on: the process, or a test's stand-in. */
export type ShutdownProcess = EventEmitter & { stdin?: EventEmitter };

/** The orderly sequence's report: the stderr lines of what it could not do. */
export interface ShutdownRun {
  /** One line per fact; exit `1` when any. */
  lines: string[];
}

export interface ShutdownSequenceOptions {
  /** Synchronous, in the trigger's tick, after the latch: stop listening, stop admission, stop input. */
  begin?: () => void;
  /**
   * The orderly sequence. `step(words)` names what it waits for now, for the
   * forced close's line (`"the instance close"`, …); `signal` aborts when the
   * forced close begins.
   */
  run: (
    step: (words: string) => void,
    signal: AbortSignal,
  ) => Promise<ShutdownRun>;
  exit: (code: number) => void;
  stderr: (line: string) => void;
  processLike: ShutdownProcess;
  /** Whether the end of stdin starts it (stdio). */
  onStdinEnd?: boolean;
  /** `--shutdown-timeout` in milliseconds: the forced close after this long. Absent: none. */
  shutdownTimeoutMs?: number | undefined;
}

/** The forced close's line for a tool still running. */
export function stillRunningLine(name: string): string {
  return `[MCP] Still running at the forced close: ${name}`;
}

/** The forced close's line for the orderly step it cut short. */
export function cutShortLine(step: string): string {
  return `[MCP] Not finished at the forced close: ${step}`;
}

/**
 * Installs the triggers and answers the sequence, for a caller that shuts
 * down for its own reason. Every call answers the same run.
 */
export function installShutdownSequence(
  options: ShutdownSequenceOptions,
): () => Promise<void> {
  const { exit, stderr, processLike } = options;
  let running: Promise<void> | undefined;
  let exited = false;
  let forcing: Promise<void> | undefined;
  let currentStep: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const forced = new AbortController();
  let finished!: () => void;
  const done = new Promise<void>((resolve) => {
    finished = resolve;
  });

  const exitOnce = (code: number) => {
    if (exited) return;
    exited = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    exit(code);
    finished();
  };

  const force = (): Promise<void> => {
    if (exited) return done;
    forcing ??= (async () => {
      forced.abort();
      // Read before the logoffs: what was pending when the waiting ended.
      const tools = pending();
      const step = currentStep;
      await forceClose();
      for (const name of tools) stderr(stillRunningLine(name));
      if (step !== undefined) stderr(cutShortLine(step));
      exitOnce(1);
    })();
    return forcing;
  };

  const sequence = async (): Promise<void> => {
    const report = await options.run((words) => {
      currentStep = words;
    }, forced.signal);
    if (forcing !== undefined || exited) return;
    for (const line of report.lines) stderr(line);
    exitOnce(report.lines.length > 0 ? 1 : 0);
  };

  const start = (): Promise<void> => {
    if (running === undefined) {
      // First, in this tick: no call is admitted from here on.
      latch();
      options.begin?.();
      if (options.shutdownTimeoutMs !== undefined) {
        timer = setTimeout(() => {
          void force();
        }, options.shutdownTimeoutMs);
      }
      running = sequence().catch(() => {
        if (forcing === undefined && !exited) {
          stderr('[MCP] The shutdown did not complete');
          exitOnce(1);
        }
      });
    }
    return done;
  };

  const signal = () => {
    if (running === undefined) void start();
    else void force();
  };
  const input = () => {
    void start();
  };

  processLike.on('SIGTERM', signal);
  processLike.on('SIGINT', signal);
  if (options.onStdinEnd) {
    processLike.stdin?.on('end', input);
    processLike.stdin?.on('close', input);
  }
  return start;
}
