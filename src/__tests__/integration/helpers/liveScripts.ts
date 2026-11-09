/**
 * The npm scripts that run live tests (plan C2, controller ruling): only
 * under one of them does the runner call the live run's setup and teardown —
 * the realm check, the logon, the run directory and the marker — and run a
 * live suite at all. A unit run (`npm test`) does none of it.
 *
 * A script is live when it runs the node:test runner (`tools/run-tests.mjs`)
 * over the integration or admin suites: a `--root` under them, or a file of
 * them named. `liveScripts.test.ts` fails when such a script of
 * `package.json` is missing here, and when a listed one does not run one
 * file at a time (`--concurrency 1`).
 */

/** The live scripts, by name. */
export const LIVE_SCRIPTS: ReadonlySet<string> = new Set([
  'test:integration',
  'test:coverage-family',
  'test:high',
  'test:live-connection',
  'shared:setup',
  'shared:teardown',
  'shared:check',
]);

/** Whether the running npm script is a live one. */
export function isLiveScript(event: string | undefined): boolean {
  return event !== undefined && LIVE_SCRIPTS.has(event);
}

/** The live suites' directories, by their repository paths. */
const LIVE_ROOTS = ['src/__tests__/integration', 'src/__tests__/admin'];

/** Whether `word` is a live suite's directory or file, or under one. */
const reachesLive = (word: string): boolean =>
  LIVE_ROOTS.some((root) => word === root || word.startsWith(`${root}/`));

/** The words of the command that runs the node:test runner, if one does. */
function runnerWords(command: string): string[] | undefined {
  const words = command.split(' ').filter((word) => word !== '');
  const at = words.indexOf('tools/run-tests.mjs');
  if (at < 1 || words[at - 1] !== 'node') return undefined;
  const end = words.indexOf('&&', at);
  return words.slice(at + 1, end < 0 ? undefined : end);
}

/**
 * Whether a script's command runs the node:test runner over the
 * integration or admin suites: a `--root` under them, or a file of them.
 */
export function selectsLiveSuites(command: string): boolean {
  const words = runnerWords(command);
  if (words === undefined) return false;
  return words.some(
    (word, at) =>
      (words[at - 1] === '--root' && reachesLive(word)) ||
      (word.endsWith('.test.ts') && reachesLive(word)),
  );
}

/** The value of `--concurrency` the runner is given in a command, if any. */
export function runnerConcurrency(command: string): string | undefined {
  const words = runnerWords(command);
  if (words === undefined) return undefined;
  const at = words.lastIndexOf('--concurrency');
  return at < 0 ? undefined : words[at + 1];
}
