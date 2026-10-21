/**
 * The shutdown of a program — core's, http's and sse's launchers: installed by the launcher only, so an embedder's process is never
 * taken over.
 *
 * **What starts it.** The first trigger — a signal (`SIGTERM`, `SIGINT`,
 * `SIGHUP`, `SIGQUIT`, on Windows `SIGBREAK`: `SHUTDOWN_SIGNALS`), for stdio
 * the end of stdin (`end` and `close` alike: one start; the client closed
 * the transport) or a broken pipe on stdin or stdout (`EPIPE`: the client is
 * gone), a crash outside a tool, or an emptied event loop (`beforeExit`) —
 * starts one sequence. In that tick the process
 * latch is set (`latch()`), before anything else: a call arriving from here
 * on is refused before any connection. Then the program's own `begin` (stop
 * listening, stop the pool's admission, stop taking input) and its orderly
 * `run`, which begins with **the logoffs at once** (`logOffAtOnce`): every
 * connection the process owns is logged off — the logoff is what releases
 * the locks — and every running call is interrupted, in the same tick;
 * nothing waits for a running tool. A tool's later requests fail against
 * the ended session, and nobody reads their answer; a queued call never
 * sends. Then the program's last steps (stdio: the session writes). No
 * deadline: the sequence takes as long as its steps do.
 *
 * **The forced close.** Only a second signal after the start, or
 * `--shutdown-timeout` (no default), ends the waiting early: no further wait
 * on a last step or a flush — every connection the process owns is logged
 * off (`forceClose`, awaited only to each logoff's write), and the exit is
 * `1` with one stderr line per fact still pending: each tool still running,
 * and the step the orderly sequence was in.
 *
 * **A crash outside a tool** (`uncaughtException`, `unhandledRejection`)
 * writes one fixed-words line naming the failure by its class and runs the
 * orderly sequence, every logoff finished, then exits `1`; a crash during a
 * running sequence lets it finish and exits `1`. A killed process
 * (`SIGKILL`, out of memory, a crash of the runtime, a power loss) cannot
 * log off: SAP's security-session timeout ends its sessions and their locks.
 *
 * Nothing is written to stdout, and no line carries an error's message.
 */

import type { EventEmitter } from 'node:events';
import { interrupt, latch, pending } from './activeTools';
import { errorClassOf } from './auth/errors';
import { forceClose, logoffsAnswered } from './ownedConnections';

/**
 * **The logoffs at once** (the process's end — stdio's client close, a
 * signal): in one tick, every connection the process owns gets its logoff
 * (`forceClose`: the main connectors, held state's, the fresh ones of long
 * reads and lock sessions, the background runs') and every live call is
 * interrupted (`interrupt`): its signal aborts, a queued call leaves without
 * sending. Resolves once every logoff the process wrote — these and any a
 * site wrote before — is answered or its transport failed
 * (`logoffsAnswered`: the connection's `flushGoodbye()`, no timer, the answer
 * not read); it waits for no tool.
 */
export async function logOffAtOnce(): Promise<void> {
  const written = forceClose();
  interrupt();
  await written;
  // The orderly end: no socket closes before its logoff is answered — SAP
  // ends a security session only once it received the logoff whole.
  await logoffsAnswered();
}

/** What the shutdown listens on: the process, or a test's stand-in. */
export type ShutdownProcess = EventEmitter & {
  stdin?: EventEmitter;
  stdout?: EventEmitter;
};

/**
 * The signals that start the orderly shutdown (a second one forces it):
 * `SIGTERM`, `SIGINT` (Ctrl+C), `SIGHUP` (the terminal closed, an SSH
 * session dropped; on Windows the console window closed — Windows ends the
 * process some seconds later whatever it does), `SIGQUIT`, and on Windows
 * `SIGBREAK` (Ctrl+Break). A name the platform does not know is an event
 * that never comes. `SIGKILL`, a crash of the runtime and a power loss
 * cannot be caught: their sessions live until SAP's security-session
 * timeout.
 */
export const SHUTDOWN_SIGNALS = [
  'SIGTERM',
  'SIGINT',
  'SIGHUP',
  'SIGQUIT',
  'SIGBREAK',
] as const;

/** Whether `error` says the other end of a pipe is gone (`EPIPE`): the client closed. */
function pipeGone(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === 'EPIPE'
  );
}

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

/**
 * The line of a crash outside a tool (`uncaughtException`,
 * `unhandledRejection`): fixed words and the thrown value's class only —
 * never its message or stack.
 */
export function processFailedLine(thrown: unknown): string {
  return `[MCP] The process failed (${errorClassOf(thrown)}): every ADT session is logged off, exit 1`;
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
  /** A crash came: the orderly end exits 1. */
  let failed = false;
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
    exitOnce(report.lines.length > 0 || failed ? 1 : 0);
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
  // A crash outside a tool (a timer, a socket callback, transport code): one
  // line naming it by its class, then the orderly shutdown — every logoff
  // finished, as at any end — and exit 1. A shutdown already running goes on
  // and exits 1; a second crash adds nothing. Only a signal or
  // --shutdown-timeout forces it.
  let crashed = false;
  const crash = (thrown: unknown) => {
    if (exited) return;
    if (!crashed) {
      crashed = true;
      try {
        stderr(processFailedLine(thrown));
      } catch {
        // The line is best effort; the logoffs are not.
      }
    }
    failed = true;
    latch();
    if (running === undefined) void start();
  };
  // The client gone (stdio): a broken pipe on stdin or stdout is its end of
  // input, not a crash; any other error of the stream is one.
  const pipeError = (error: unknown) => {
    if (pipeGone(error)) input();
    else crash(error);
  };

  for (const name of SHUTDOWN_SIGNALS) processLike.on(name, signal);
  processLike.on('uncaughtException', crash);
  processLike.on('unhandledRejection', crash);
  // The event loop emptied with no trigger before it: the orderly shutdown,
  // once, so no connection is left without its logoff.
  processLike.on('beforeExit', () => {
    if (running === undefined && !exited) void start();
  });
  if (options.onStdinEnd) {
    processLike.stdin?.on('end', input);
    processLike.stdin?.on('close', input);
    processLike.stdin?.on('error', pipeError);
    processLike.stdout?.on('error', pipeError);
  }
  return start;
}
