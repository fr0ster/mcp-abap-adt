/**
 * What a compact lock and unlock answer beside SAP's: the lock's handle and
 * the instance holding it, or an unlock that released nothing, and why.
 */

/** What a lock held by a server instance answers: its handle, and the instance's. */
export interface HeldLockAnswer {
  readonly lock_handle: string;
  readonly state_handle?: string | undefined;
}

/** An unlock that released nothing: the lock went with its session, or there was none. */
export interface NotUnlockedAnswer {
  readonly unlocked: false;
  readonly reason: string;
}
