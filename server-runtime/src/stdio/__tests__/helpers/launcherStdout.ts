/**
 * The stdio launcher run as a client runs it: in a scenario process of its
 * own (`scenarios/launcherStdout.scenario.ts`), so the test reads that
 * process's stdout from the outside, which a spy on the test file's own
 * stdout cannot do (it would sit between node:test's runner and its report;
 * Task 3.1, measured). A file using it kills its children after each case
 * (`killScenarioChildren`).
 */
import assert from 'node:assert/strict';
import { runScenarioOutput } from '../../../../../src/__tests__/helpers/scenarioOutput';

const STDOUT_SCENARIO =
  'server-runtime/src/stdio/__tests__/scenarios/launcherStdout.scenario.ts';

/**
 * The start `argv` describes, in a scenario process of its own
 * (`scenarios/launcherStdout.scenario.ts`) with this case's working
 * directory and environment. Its stdout must carry its report line and
 * nothing else: what a launcher wrote there would be read by the client of
 * a stdio server as protocol. A spy on this process's stdout would sit
 * between node:test's runner and its report (Task 3.1, measured).
 */
export async function childStart(
  mode: 'launch' | 'login',
  platform: string,
  argv: string[],
): Promise<{ exits: unknown; loginEnded: unknown }> {
  const out = await runScenarioOutput(STDOUT_SCENARIO, [
    process.cwd(),
    mode,
    platform,
    '--',
    ...argv,
  ]);
  assert.equal(out.code, 0, out.stderr);
  const lines = out.stdout.split('\n').filter((line) => line !== '');
  // The report is one JSON object on one line; a byte before or after it
  // is something else that reached stdout.
  assert.ok(
    lines.length === 1 &&
      out.stdout === `${lines[0]}\n` &&
      out.stdout.startsWith('{"'),
    `stdout carried more than the report: ${JSON.stringify(out.stdout.slice(0, 200))}`,
  );
  const parsed: unknown = JSON.parse(lines[0] ?? '');
  const field = (key: string): unknown =>
    typeof parsed === 'object' && parsed !== null && key in parsed
      ? Reflect.get(parsed, key)
      : undefined;
  assert.deepStrictEqual(field('unhandled'), []);
  return { exits: field('exits'), loginEnded: field('loginEnded') };
}
