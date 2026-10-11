/**
 * Errors of the authentication layer that lib keeps. They name fields and
 * vetted vocabulary only — never a value read from a file (H4). What a thrown
 * value is, as an answer, is `failureOf`'s (`./failures`); the destination
 * layer's own errors live in core (`server/src/auth/destinationFailure.ts`).
 */

/** Whether `text` is an identifier: a letter, `_` or `$`, then word characters. Plain code (D26). */
function isIdentifier(text: string): boolean {
  if (text.length === 0) return false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    const letter =
      (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36;
    const digit = c >= 48 && c <= 57;
    if (!(letter || (i > 0 && digit))) return false;
  }
  return true;
}

/**
 * A thrown value's class, never its message: what a log line or an answer
 * may say about an error the server has no words for (H4). The class's name
 * is read from its constructor only when it is an identifier.
 */
export function errorClassOf(error: unknown): string {
  if (error instanceof Error) {
    let name: unknown;
    try {
      name = error.constructor?.name;
    } catch {
      name = undefined;
    }
    return typeof name === 'string' && isIdentifier(name) ? name : 'Error';
  }
  return typeof error;
}

/** Settings an authentication cannot use; `setting` names the parameter. */
export class SettingsError extends Error {
  readonly code = 'UNSUPPORTED_SETTINGS' as const;
  readonly setting: string;

  constructor(setting: string, reason: string) {
    super(`Setting '${setting}': ${reason}`);
    this.name = 'SettingsError';
    this.setting = setting;
  }
}
