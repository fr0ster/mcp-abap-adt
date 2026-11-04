/**
 * The npm scripts that run live tests (plan C2, controller ruling): only
 * under one of them does Jest's `globalSetup` do live work — the realm
 * check, the logon, the run directory and the marker. A unit run
 * (`npm test`) does none of it.
 *
 * A script is live when it runs Jest over the integration or admin suites:
 * a `--testPathPatterns` naming them, or a `--testPathIgnorePatterns` that
 * replaces the default list without ignoring both. `liveScripts.test.ts`
 * fails when such a script of `package.json` is missing here, and when a
 * listed one does not run `--runInBand`.
 */

/** The live scripts, by name. */
export const LIVE_SCRIPTS: ReadonlySet<string> = new Set([
  'test:integration',
  'test:coverage-family',
  'test:high',
  'shared:setup',
  'shared:teardown',
  'shared:check',
]);

/** Whether the running npm script is a live one. */
export function isLiveScript(event: string | undefined): boolean {
  return event !== undefined && LIVE_SCRIPTS.has(event);
}

/** A flag's value in a command's words, its quotes dropped. */
function flagValue(words: readonly string[], flag: string): string | undefined {
  const word = words.find((each) => each.startsWith(`${flag}=`));
  if (word === undefined) return undefined;
  const value = word.slice(flag.length + 1);
  return value.startsWith("'") && value.endsWith("'")
    ? value.slice(1, -1)
    : value;
}

/** Whether a script's command runs Jest over the integration or admin suites. */
export function selectsLiveSuites(command: string): boolean {
  const words = command.split(' ').filter((word) => word !== '');
  if (words[0] !== 'jest') return false;
  const patterns = flagValue(words, '--testPathPatterns');
  if (
    patterns !== undefined &&
    (patterns.includes('integration') || patterns.includes('admin'))
  ) {
    return true;
  }
  const ignored = flagValue(words, '--testPathIgnorePatterns');
  return (
    ignored !== undefined &&
    !(
      ignored.includes('__tests__/integration/') &&
      ignored.includes('__tests__/admin/')
    )
  );
}
