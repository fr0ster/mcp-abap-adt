/**
 * The take-up case of the deferred-logon live suite, as a flow over
 * launched servers (#353): a first process locks a class and is killed,
 * leaving its session; a second, with `--restore-session`, takes it up at
 * its first call and unlocks with the first one's lock handle.
 *
 * **The cleanup runs on every path once the first process may have written
 * its session.** From its first call on, the session may exist on SAP —
 * with the lock — and its runtime file with it; whatever fails after that
 * (no lock handle, the second launch, the unlock), the flow ends by closing
 * the second process (its shutdown logs off what it holds) and then logging
 * off every leftover session of the destination through a process of its
 * own (`ListLeftoverSessions`, `LogoffLeftoverSession`). Only an unlock
 * that succeeded leaves nothing to clean. The flow takes its servers from
 * the caller, so its paths are pinned with stand-ins
 * (`src/__tests__/unit/coverage/takeUpCase.test.ts`), no system needed.
 */
import type { LaunchedServer } from './launchedServers';

/** What the flow calls of a launched server. */
export type TakeUpServer = Pick<LaunchedServer, 'call' | 'close'> & {
  /** Ends the process at once, as a crash does: its session is left behind. */
  kill(): void;
  /** Stops it with its shutdown; its exit code. */
  stop(): Promise<number | null>;
};

export interface TakeUpLaunches {
  /** The first process: `--deferred-logon`. */
  first(): Promise<TakeUpServer>;
  /** The second: `--deferred-logon --restore-session`. */
  second(): Promise<TakeUpServer>;
  /** A process of the cleanup's own: `--deferred-logon`, no restore. */
  cleaner(): Promise<TakeUpServer>;
}

/** What the flow saw: the unlock's answer, and whether the cleanup ran. */
export interface TakeUpResult {
  unlocked: boolean;
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

/**
 * An answer's text for a failure message, so a failing run logs why (the
 * tool's error: SAP's status, message id and words), with every occurrence
 * of `hidden` (a lock handle) replaced: no handle reaches a log.
 */
function answerText(content: readonly { text: string }[], hidden = ''): string {
  const text = content.map((part) => part.text).join('');
  return hidden === '' ? text : text.split(hidden).join('<lock handle>');
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
 * the unlock did not succeed — and answers what it saw otherwise.
 */
export async function takeUpCase(
  launches: TakeUpLaunches,
  lockClass: string,
): Promise<TakeUpResult> {
  const first = await launches.first();
  let unlocked = false;
  let second: TakeUpServer | undefined;
  let secondExit: number | null | undefined;
  let cleaned = false;
  try {
    let lockHandle = '';
    let lockAnswer = '';
    try {
      const locked = await first.call('LockObjectLow', {
        object_name: lockClass,
        object_type: 'class',
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
    const answer = await second.call('UnlockObjectLow', {
      object_name: lockClass,
      object_type: 'class',
      lock_handle: lockHandle,
    });
    unlocked = !answer.isError;
    if (!unlocked)
      throw new Error(
        `the unlock with the old handle was refused: ${answerText(answer.content, lockHandle)}`,
      );
  } finally {
    if (second !== undefined) {
      secondExit = await second.stop();
      await second.close().catch(() => undefined);
    }
    if (!unlocked) {
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
  return { unlocked, cleaned, secondExit };
}
