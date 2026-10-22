import { globSync as globSyncRaw } from 'node:fs';

/**
 * The two things a test does to the filesystem that Windows answers
 * differently, in one place.
 *
 * Neither is about the product. They are about how a test reaches a file or a
 * process, and both were red on the Windows legs of CI for months without
 * anyone seeing it — the `Run tests` step carried `continue-on-error: true`,
 * so the suite ran and its verdict was discarded. Removing that line is what
 * made these worth fixing rather than worth knowing about.
 */

/**
 * `npm` is `npm.cmd` on Windows, and `execFile`/`spawn` do not look for the
 * extension: the call fails with `spawnSync npm ENOENT` and the whole suite
 * fails to run. A shell finds it. Passing `shell` everywhere would be worse —
 * arguments would then go through shell quoting on every platform — so it is
 * asked for only where it is needed.
 */
export const spawnOptionsForNpm = {
  shell: process.platform === 'win32',
} as const;

/**
 * The command that runs a TypeScript script through the installed `tsx`:
 * this Node and tsx's own CLI, resolved from this checkout's `node_modules`.
 * Not `npx tsx`, which falls back to fetching a package from the registry
 * when the local one cannot be found, and not a shell.
 */
export const tsxCommand = (args: readonly string[]): [string, string[]] => [
  process.execPath,
  [require.resolve('tsx/cli'), ...args],
];

/**
 * `glob` answers the platform's own separator, so a path it returns is
 * `src\\handlers\\class\\high\\handleX.ts` on Windows and does not match a
 * ledger, a fixture name or an `expect` written with `/`. Every caller here
 * compares against literals written the POSIX way, so the answers are
 * normalised once rather than at each comparison.
 */
export function globSync(pattern: string): string[] {
  return [...globSyncRaw(pattern)].map((found) =>
    String(found).split('\\').join('/'),
  );
}
