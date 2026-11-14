/**
 * The take-up case of the deferred-logon live suite, as a flow over
 * launched servers (#353). A take-up keeps the same SAP session, and its
 * logoff frees what that session held; the case proves exactly that:
 *
 * 1. a first process (`--deferred-logon`) locks the class (`HandlerLock`)
 *    and is killed: its session and its lock are left behind;
 * 2. a second (`--deferred-logon --restore-session`) takes the session up
 *    at its first call (`HandlerGet` of the class);
 * 3. while the second holds it, a separate session of the same user — its
 *    own connection, inside the test — is refused the class: the lock
 *    survived the take-up (SAP's answer is the result);
 * 4. the second stops: its shutdown logs off the session it took up;
 * 5. the separate session can now lock the class, and unlocks it.
 *
 * **The cleanup runs on every path that did not prove the class free.**
 * From the first process's lock on, the session may exist on SAP — with
 * the lock — and its runtime file with it; whatever fails after that, the
 * flow ends by stopping the second process (its shutdown logs off what it
 * holds) and then logging off every leftover session of the destination
 * through a process of its own (`ListLeftoverSessions`,
 * `LogoffLeftoverSession`). A lock the separate session took is released
 * before the flow ends. No lock handle reaches a failure. The flow takes
 * its servers and the separate session from the caller, so its paths are
 * pinned with stand-ins (`src/__tests__/unit/coverage/takeUpCase.test.ts`),
 * no system needed.
 */
import type { LaunchedServer } from './launchedServers';

/** What the flow calls of a launched server. */
export type TakeUpServer = Pick<LaunchedServer, 'call' | 'close'> & {
  /** Ends the process at once, as a crash does: its session is left behind. */
  kill(): void;
  /** Stops it with its shutdown; its exit code. */
  stop(): Promise<number | null>;
};

/** A lock attempt of the separate session: its handle, or SAP's refusal. */
export type SeparateLock = { handle: string } | { refused: string };

/** A session of the same user on a connection of its own, inside the test. */
export interface SeparateSession {
  lock(): Promise<SeparateLock>;
  unlock(handle: string): Promise<{ ok: true } | { refused: string }>;
  close(): Promise<void>;
}

export interface TakeUpLaunches {
  /** The first process: `--deferred-logon`. */
  first(): Promise<TakeUpServer>;
  /** The second: `--deferred-logon --restore-session`. */
  second(): Promise<TakeUpServer>;
  /** The separate session, opened once the second holds the session. */
  separate(): Promise<SeparateSession>;
  /** A process of the cleanup's own: `--deferred-logon`, no restore. */
  cleaner(): Promise<TakeUpServer>;
}

/** What the flow saw. */
export interface TakeUpResult {
  /** SAP's refusal of the separate lock while the second held the session. */
  heldWhileTakenUp: string;
  /** The separate session locked and unlocked the class after the logoff. */
  freedAfterLogoff: boolean;
  cleaned: boolean;
  secondExit: number | null | undefined;
}

/** The fields of a tool answer's JSON text; `{}` for a text that is not one. */
function fieldsOf(
  content: readonly { text: string }[],
): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(
      content.map((part) => part.text).join(''),
    );
    return typeof parsed === 'object' && parsed !== null ? { ...parsed } : {};
  } catch {
    return {};
  }
}

/** `text` with every occurrence of `hidden` (a lock handle) replaced. */
function masked(text: string, hidden: string): string {
  return hidden === '' ? text : text.split(hidden).join('<lock handle>');
}

/**
 * An answer's text for a failure message, so a failing run logs why (the
 * tool's error: SAP's status, message id and words), with every occurrence
 * of `hidden` (a lock handle) replaced: no handle reaches a log.
 */
function answerText(content: readonly { text: string }[], hidden = ''): string {
  return masked(content.map((part) => part.text).join(''), hidden);
}

/** Logs off every leftover session the cleaner's destination lists. */
async function logOffLeftovers(cleaner: TakeUpServer): Promise<void> {
  const listed = await cleaner.call('ListLeftoverSessions', {});
  const sessions = fieldsOf(listed.content).sessions;
  if (!Array.isArray(sessions)) return;
  for (const session of sessions) {
    const handle =
      typeof session === 'object' && session !== null && 'handle' in session
        ? session.handle
        : undefined;
    if (typeof handle === 'string') {
      await cleaner.call('LogoffLeftoverSession', { handle });
    }
  }
}

/**
 * The flow. Throws what failed — after the cleanup, which runs whenever
 * the class was not proved free — and answers what it saw otherwise.
 */
export async function takeUpCase(
  launches: TakeUpLaunches,
  lockClass: string,
): Promise<TakeUpResult> {
  const first = await launches.first();
  let second: TakeUpServer | undefined;
  let separate: SeparateSession | undefined;
  let secondExit: number | null | undefined;
  let heldWhileTakenUp = '';
  let freedAfterLogoff = false;
  let cleaned = false;
  const stopSecond = async (): Promise<void> => {
    if (second === undefined) return;
    const stopping = second;
    second = undefined;
    secondExit = await stopping.stop();
    await stopping.close().catch(() => undefined);
  };
  try {
    let lockHandle = '';
    let lockAnswer = '';
    try {
      const locked = await first.call('HandlerLock', {
        object_type: 'CLASS',
        object_name: lockClass,
      });
      const handle = fieldsOf(locked.content).lock_handle;
      lockHandle = !locked.isError && typeof handle === 'string' ? handle : '';
      if (lockHandle === '') lockAnswer = answerText(locked.content);
    } finally {
      // Killed: its session and its lock are left behind.
      first.kill();
      await first.close().catch(() => undefined);
    }
    if (lockHandle === '')
      throw new Error(`the lock answered no lock handle: ${lockAnswer}`);

    second = await launches.second();
    const takenUp = await second.call('HandlerGet', {
      object_type: 'CLASS',
      object_name: lockClass,
      part: 'source',
    });
    if (takenUp.isError)
      throw new Error(
        `the take-up call failed: ${answerText(takenUp.content, lockHandle)}`,
      );

    separate = await launches.separate();
    const whileHeld = await separate.lock();
    if ('handle' in whileHeld) {
      const released = await separate.unlock(whileHeld.handle);
      throw new Error(
        `the class was not held while the session was taken up: the separate session locked it${
          'refused' in released
            ? `, and its unlock was refused: ${masked(released.refused, whileHeld.handle)}`
            : ''
        }`,
      );
    }
    heldWhileTakenUp = masked(whileHeld.refused, lockHandle);

    // The second's shutdown logs off the session it took up.
    await stopSecond();

    const afterLogoff = await separate.lock();
    if ('refused' in afterLogoff)
      throw new Error(
        `the class is still held after the logoff: ${masked(afterLogoff.refused, lockHandle)}`,
      );
    const unlocked = await separate.unlock(afterLogoff.handle);
    if ('refused' in unlocked)
      throw new Error(
        `the separate session's unlock was refused: ${masked(
          masked(unlocked.refused, afterLogoff.handle),
          lockHandle,
        )}`,
      );
    freedAfterLogoff = true;
  } finally {
    await stopSecond();
    if (separate !== undefined) await separate.close();
    if (!freedAfterLogoff) {
      const cleaner = await launches.cleaner();
      try {
        await logOffLeftovers(cleaner);
        cleaned = true;
      } finally {
        await cleaner.stop();
        await cleaner.close().catch(() => undefined);
      }
    }
  }
  return { heldWhileTakenUp, freedAfterLogoff, cleaned, secondExit };
}
