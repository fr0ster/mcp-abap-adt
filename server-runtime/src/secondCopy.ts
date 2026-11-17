import type { LibInstance } from '@mcp-abap-adt/lib/config';

/**
 * How a registered copy is named: a copy from 24.0.0 on by its version and
 * label (`24.0.0 dist`), an earlier one — which registered a file — in fixed
 * words, its file never read or shown.
 */
export function copyWords(instance: LibInstance): string {
  return 'file' in instance
    ? 'a copy before 24.0.0'
    : `${instance.version} ${instance.label}`;
}

/**
 * The one line a transport's `main` stops on when more than one copy of
 * `@mcp-abap-adt/lib` is loaded in the process: the first two registered
 * copies and the package to reinstall. `undefined` for one copy — and for
 * none, which cannot happen in a process that loaded lib (this module's
 * caller imports it), so it is read as one.
 */
export function secondCopyLine(
  instances: readonly LibInstance[],
  packageName: string,
): string | undefined {
  const [first, second] = instances;
  if (first === undefined || second === undefined) return undefined;
  return `Two copies of @mcp-abap-adt/lib are loaded in this process (${copyWords(first)}, ${copyWords(second)}): reinstall ${packageName} (npm install -g ${packageName}).`;
}
