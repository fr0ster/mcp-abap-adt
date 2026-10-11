/**
 * A destination name becomes a file name in `keysDir` and `sessionsDir`.
 * One that is a path, hidden, empty or outside a small alphabet is refused
 * before any file is touched. The name is not quoted: it may be a path.
 * Plain code, no regular expression (D26).
 */

import { ServerRefusal } from './serverRefusal';

/** `A-Z`, `a-z`, `0-9` or `_`. */
function isWordChar(c: number): boolean {
  return (
    (c >= 65 && c <= 90) ||
    (c >= 97 && c <= 122) ||
    (c >= 48 && c <= 57) ||
    c === 95
  );
}

/** A word character first, then word characters, `.` or `-`. */
function inAlphabet(name: string): boolean {
  for (let i = 0; i < name.length; i += 1) {
    const c = name.charCodeAt(i);
    const allowed = isWordChar(c) || (i > 0 && (c === 46 || c === 45));
    if (!allowed) return false;
  }
  return true;
}

function refuse(words: string): never {
  throw new ServerRefusal('destination_refused', words);
}

/**
 * @param name the destination name as given
 * @param source a free label for the message (`x-mcp-destination`, `--mcp`, ...)
 */
export function assertDestinationName(name: string, source: string): void {
  if (typeof name !== 'string' || name.length === 0) {
    refuse(`${source}: a destination name must not be empty.`);
  }
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    refuse(
      `${source}: a destination name must not contain a path separator or "..".`,
    );
  }
  if (name.startsWith('.')) {
    refuse(`${source}: a destination name must not start with a dot.`);
  }
  if (!inAlphabet(name)) {
    refuse(
      `${source}: a destination name may use only letters, digits, "_", "." and "-".`,
    );
  }
}
