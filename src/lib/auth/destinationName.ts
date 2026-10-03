/**
 * A destination name becomes a file name in `keysDir` and `sessionsDir`.
 * One that is a path, hidden, empty or outside a small alphabet is refused
 * before any file is touched. The name is not quoted: it may be a path.
 */

import { DestinationRefusal } from './errors';

const ALLOWED = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

/**
 * @param name the destination name as given
 * @param source a free label for the message (`x-mcp-destination`, `--mcp`, ...)
 */
export function assertDestinationName(name: string, source: string): void {
  if (typeof name !== 'string' || name.length === 0) {
    throw new DestinationRefusal(
      `${source}: a destination name must not be empty.`,
    );
  }
  if (/[\\/]/.test(name) || name.includes('..')) {
    throw new DestinationRefusal(
      `${source}: a destination name must not contain a path separator or "..".`,
    );
  }
  if (name.startsWith('.')) {
    throw new DestinationRefusal(
      `${source}: a destination name must not start with a dot.`,
    );
  }
  if (!ALLOWED.test(name)) {
    throw new DestinationRefusal(
      `${source}: a destination name may use only letters, digits, "_", "." and "-".`,
    );
  }
}
