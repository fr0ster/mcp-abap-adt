/**
 * The one process-wide registry of live tool calls, across every server
 * instance (spec §6.4, D33, D51, D55): each call is registered at the tool
 * wrapper's entry — before any connection is acquired or the handler runs —
 * with the server instance it runs in, and removed when the call ends.
 *
 * It keeps each call's settlement, so an instance close can await it, and
 * each call's controller, so a process shutdown — stdio's included, which
 * begins when the client closes the transport — interrupts every running
 * call at once (`interrupt()`): its signal aborts, its waits end, a queued
 * call leaves the queue without sending. Nothing else here aborts a call: a
 * client's cancel aborts nothing. Two latches, each set synchronously when
 * its close begins:
 *
 * - the process latch (`latch()`), set first by every launcher's shutdown;
 * - an instance's own latch (`latch(instance)`), set first by its close (D51).
 *
 * Once either is set, `registerActiveTool` refuses — the wrapper answers that
 * request with the shutdown refusal before any connection or handler — so
 * `settled()` waits for a complete set: nothing can be added after the latch.
 * One implementation, used by every launcher's shutdown and by an
 * instance's close; no transport keeps a registry of its own.
 */

import { answerRead, type FailureAnswer } from './auth/answerFailure';
import { SHUTDOWN_SENTENCE, shutdownRefusal } from './auth/failures';

export { SHUTDOWN_SENTENCE, shutdownRefusal };

/** A registered call, as the registry shows it. */
export interface ActiveTool {
  /** The call's request signal: aborted by its client or its end — never by the registry. */
  readonly signal: AbortSignal;
  /** The tool's name, for the forced close's exit line. */
  readonly name: string;
}

/** What a call registers beside its controller. */
export interface ActiveToolEntry {
  /** The server instance the call runs in; absent for a call of no instance. */
  readonly instance?: object | undefined;
  /** The tool's name. */
  readonly name?: string | undefined;
}

interface Live {
  readonly controller: AbortController;
  readonly instance: object | undefined;
  readonly name: string;
  readonly ended: Promise<void>;
  readonly end: () => void;
}

const live = new Set<Live>();
let processLatched = false;
const instanceLatches = new WeakSet<object>();

/**
 * Registers a call; answers the function that removes it (removing twice is
 * harmless), or `undefined` when the process or the call's instance is
 * latched — then the call must not start.
 */
export function registerActiveTool(
  controller: AbortController,
  entry: ActiveToolEntry = {},
): (() => void) | undefined {
  if (isLatched(entry.instance)) return undefined;
  let end!: () => void;
  const ended = new Promise<void>((resolve) => {
    end = resolve;
  });
  const item: Live = {
    controller,
    instance: entry.instance,
    name: entry.name ?? 'a tool',
    ended,
    end,
  };
  live.add(item);
  return () => {
    live.delete(item);
    item.end();
  };
}

/**
 * Sets the process latch (no argument) or an instance's own latch:
 * synchronous, in the tick the shutdown or the close begins. Nothing unsets it.
 */
export function latch(instance?: object): void {
  if (instance === undefined) processLatched = true;
  else instanceLatches.add(instance);
}

/** Whether a call of `instance` (or of no instance) is refused now. */
export function isLatched(instance?: object): boolean {
  return (
    processLatched || (instance !== undefined && instanceLatches.has(instance))
  );
}

/**
 * Resolves when every call registered so far — of the whole process, or of
 * `instance` alone — has ended. Nothing is aborted; after the latch the set
 * is complete, so this waits for exactly the calls admitted before it.
 */
export async function settled(instance?: object): Promise<void> {
  const of = () =>
    [...live].filter(
      (item) => instance === undefined || item.instance === instance,
    );
  let waiting = of();
  while (waiting.length > 0) {
    await Promise.all(waiting.map((item) => item.ended));
    waiting = of();
  }
}

/**
 * Interrupts every live call of the process — or of `instance` alone: each
 * call's signal aborts at once — its waits end, a call queued in its
 * instance's main flow leaves without sending. It waits for nothing and
 * removes nothing: each call leaves the registry when it settles. The
 * process shutdown (`logOffAtOnce`) and an instance's close
 * (`closeInstance`) run it in the tick their logoffs are sent, after the
 * latch.
 */
export function interrupt(instance?: object): void {
  for (const item of [...live]) {
    if (instance === undefined || item.instance === instance) {
      item.controller.abort();
    }
  }
}

/** The calls live now, a snapshot. */
export function activeTools(): readonly ActiveTool[] {
  return [...live].map((item) => ({
    signal: item.controller.signal,
    name: item.name,
  }));
}

/**
 * What still runs, for the forced close's exit line: each tool's name, with
 * how many of its calls run when more than one.
 */
export function pending(): string[] {
  const counts = new Map<string, number>();
  for (const item of live) {
    counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) =>
    count === 1 ? name : `${name} (${count} calls)`,
  );
}

/** The answer of a call a latch refused: the shutdown refusal, as a tool result. */
export function shutdownRefusalAnswer(): FailureAnswer {
  return answerRead(shutdownRefusal());
}

/**
 * @internal For tests only: the process latch is never unset in a program —
 * the process exits after its shutdown. A test file that runs several
 * shutdowns in one process resets it between them.
 */
export function resetProcessLatchForTests(): void {
  processLatched = false;
}
