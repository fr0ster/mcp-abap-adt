/**
 * What the two leftover-session tools ask of their server instance — the
 * instance's port, bound to one call (its request's credential and signal).
 * `BaseMcpServer` fills it when its host gave it an owner
 * (`LeftoverSessions`); a context without it answers "not available here".
 */

import type { LeftoverListing } from './LeftoverSessions';

/** The status of SAP's answer to a request, as SAP gave it. */
export interface SapAnswer {
  status: number;
}

/** The logoff was written (its answer is not read); the file is deleted. */
export type LogoffOutcome = { handle: string; state: 'logged_off' };

export interface LeftoverSessionTools {
  /** The caller's leftover sessions. */
  list(): Promise<LeftoverListing[]>;
  /** The ICF logoff with the session's cookies, and nothing else; then its file deleted. */
  logoff(handle: string): Promise<LogoffOutcome>;
}

/**
 * SAP's answer in a thrown request failure — its status — or `undefined`
 * when SAP did not answer (the network failed, nothing was sent). Read
 * structurally: no header and no body is taken, so no cookie.
 */
export function sapAnswerOf(thrown: unknown): SapAnswer | undefined {
  try {
    const response = (thrown as { response?: unknown } | null | undefined)
      ?.response as { status?: unknown } | undefined;
    if (response === undefined || response === null) return undefined;
    const status = response.status;
    if (typeof status !== 'number' || !Number.isInteger(status)) {
      return undefined;
    }
    return { status };
  } catch {
    return undefined;
  }
}
