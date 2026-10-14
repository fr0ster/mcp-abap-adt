/**
 * What the three leftover-session tools ask of their server instance — the
 * instance's port, bound to one call (its request's credential and signal).
 * `BaseMcpServer` fills it when its host gave it an owner
 * (`LeftoverSessions`); a context without it answers "not available here".
 */

import type { LeftoverListing } from './LeftoverSessions';

/** SAP's answer to a session that is gone, as SAP gave it. */
export interface SapAnswer {
  status: number;
  /** The answer's body as text, clipped; absent when there was none. */
  body?: string;
}

/**
 * The instance's connection is built from the leftover session: the old
 * session picked up (`picked_up`), or — SAP answered it is gone — a new one
 * started with the normal logon (`new`). Its file is this process's either
 * way, under the same handle.
 */
export type ResumeOutcome = {
  handle: string;
  state: 'resumed';
  session: 'picked_up' | 'new';
};

/** The logoff was written (its answer is not read); the file is deleted. */
export type LogoffOutcome = { handle: string; state: 'logged_off' };

export interface LeftoverSessionTools {
  /** The caller's leftover sessions. */
  list(): Promise<LeftoverListing[]>;
  /** Builds this instance's connection from the session instead of a plain logon. */
  resume(handle: string): Promise<ResumeOutcome>;
  /** The ICF logoff with the session's cookies, and nothing else; then its file deleted. */
  logoff(handle: string): Promise<LogoffOutcome>;
}

const BODY_CHARS = 2000;

/**
 * SAP's answer in a thrown request failure — its status and body — or
 * `undefined` when SAP did not answer (the network failed, nothing was
 * sent). Read structurally: no header is taken, so no cookie.
 */
export function sapAnswerOf(thrown: unknown): SapAnswer | undefined {
  try {
    const response = (thrown as { response?: unknown } | null | undefined)
      ?.response as { status?: unknown; data?: unknown } | undefined;
    if (response === undefined || response === null) return undefined;
    const status = response.status;
    if (typeof status !== 'number' || !Number.isInteger(status)) {
      return undefined;
    }
    const data = response.data;
    const text =
      typeof data === 'string'
        ? data
        : data === undefined || data === null
          ? ''
          : (() => {
              try {
                return JSON.stringify(data) ?? '';
              } catch {
                return '';
              }
            })();
    return text === ''
      ? { status }
      : { status, body: text.slice(0, BODY_CHARS) };
  } catch {
    return undefined;
  }
}
