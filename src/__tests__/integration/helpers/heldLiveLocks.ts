/**
 * The compact locks a live case holds, until SAP answers their unlock with a
 * success: a lock whose write threw, or whose unlock SAP refused, is
 * unlocked again at the suite's end, before the cleanup deletes. No import of
 * the live runner: the unlock is handed in, so the registry is tested alone.
 */

/** A compact lock a case holds. */
export interface HeldLock {
  readonly object_type: string;
  readonly object_name: string;
  readonly lock_handle: string;
}

/** An unlock's answer, as far as the registry reads it. */
export interface UnlockAnswer {
  readonly isError?: boolean | undefined;
  readonly text: string;
}

/** The locks a suite holds. */
export class HeldLiveLocks {
  private readonly held: HeldLock[] = [];

  /** Records a handle the case now holds. */
  hold(lock: HeldLock): void {
    this.held.push(lock);
  }

  /** SAP answered the unlock of `handle` with a success: held no more. */
  released(handle: string): void {
    const at = this.held.findIndex((lock) => lock.lock_handle === handle);
    if (at >= 0) this.held.splice(at, 1);
  }

  /** The locks still held. */
  get stillHeld(): readonly HeldLock[] {
    return [...this.held];
  }

  /**
   * Sends `unlock` for every lock still held, each attempted whatever the
   * others answered: a success releases it; an error reply or a throw keeps
   * it held, and `report` gets a line naming it and SAP's words. Answers the
   * locks still held after the attempts.
   */
  async releaseAll(
    unlock: (lock: HeldLock) => Promise<UnlockAnswer>,
    report: (line: string) => void,
  ): Promise<readonly HeldLock[]> {
    for (const lock of [...this.held]) {
      try {
        const answer = await unlock(lock);
        if (answer.isError === true) {
          report(
            `still held: ${lock.object_type} ${lock.object_name}: ${answer.text}`,
          );
        } else {
          this.released(lock.lock_handle);
        }
      } catch (error) {
        report(
          `still held: ${lock.object_type} ${lock.object_name}: ${String(error)}`,
        );
      }
    }
    return this.stillHeld;
  }
}
