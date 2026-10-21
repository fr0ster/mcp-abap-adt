import type { LibInstance } from '@mcp-abap-adt/lib/config';

/**
 * The one line a transport's `main` stops on when more than one copy of
 * `@mcp-abap-adt/lib` is loaded in the process: the first two registered
 * files and the package to reinstall. `undefined` for one copy — and for
 * none, which cannot happen in a process that loaded lib (this module's
 * caller imports it), so it is read as one.
 */
export function secondCopyLine(
  instances: readonly LibInstance[],
  packageName: string,
): string | undefined {
  const [first, second] = instances;
  if (first === undefined || second === undefined) return undefined;
  return `Two copies of @mcp-abap-adt/lib are loaded in this process (${first.file}, ${second.file}): reinstall ${packageName} (npm install -g ${packageName}).`;
}
