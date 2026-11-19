/**
 * Runs a scenario in a process of its own and answers what it left on both
 * its streams — the test as the client that owns that process's stdout and
 * stderr. A scenario is a TypeScript file run by `process.execPath` through
 * tsx (`--import tsx`), as `plainNode.ts` runs one; unlike `runPlainNode`,
 * no report is required and nothing is parsed here: the caller asserts on
 * the streams themselves.
 *
 * Runner-neutral (it imports only `node:` modules): a node:test file kills
 * every child still running in its own `afterEach`
 * (`killScenarioChildren`), and a `signal` given kills the child when it
 * aborts.
 */
import { type ChildProcess, execFile } from 'node:child_process';
import * as path from 'node:path';
import { repositoryRoot } from './repoRoot';

const ROOT = repositoryRoot(__dirname);

/** What a scenario process left on its two streams, and how it ended. */
export interface ScenarioOutput {
  stdout: string;
  stderr: string;
  /** The exit code; `null` when a signal ended it. */
  code: number | null;
}

const live = new Set<ChildProcess>();

/**
 * The child's environment: this process's, with tsx pointed at the test
 * configuration (it carries the package-name aliases a scenario's imports
 * use), and without `NODE_TEST_CONTEXT`, which node:test sets in a test
 * file's process and which would make the child report to its runner.
 */
function childEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TSX_TSCONFIG_PATH: path.join(ROOT, 'tsconfig.test.json'),
  };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

const exited = (child: ChildProcess) =>
  child.exitCode !== null || child.signalCode !== null;

/** Kills every child still running and waits until each has exited. */
export async function killScenarioChildren(): Promise<void> {
  const running = [...live];
  live.clear();
  await Promise.all(
    running.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (exited(child)) {
            resolve();
            return;
          }
          child.once('exit', () => resolve());
          child.kill('SIGKILL');
        }),
    ),
  );
}

/** Runs `scenario` (a path under the repository) with `args`; answers both streams and the exit code. */
export function runScenarioOutput(
  scenario: string,
  args: string[] = [],
  options: { signal?: AbortSignal } = {},
): Promise<ScenarioOutput> {
  return new Promise((resolve) => {
    let finished: ScenarioOutput | undefined;
    let gone = false;
    const settle = () => {
      if (finished !== undefined && gone) resolve(finished);
    };
    const child = execFile(
      process.execPath,
      ['--import', 'tsx', path.resolve(ROOT, scenario), ...args],
      {
        cwd: ROOT,
        env: childEnvironment(),
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        killSignal: 'SIGKILL',
        ...(options.signal !== undefined && { signal: options.signal }),
      },
      (error, stdout, stderr) => {
        const code =
          error === null
            ? 0
            : typeof error.code === 'number'
              ? error.code
              : null;
        finished = { stdout, stderr, code };
        settle();
      },
    );
    live.add(child);
    child.once('exit', () => {
      live.delete(child);
      gone = true;
      settle();
    });
  });
}
