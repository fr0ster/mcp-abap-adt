/**
 * The network cut for a live run (#394, spec §8): what proves, on a real
 * system, that a soft-mode run keeps its SAP session through an outage.
 *
 * - **Activation.** Only when the run sets both `MCP_TEST_NETWORK_CUT_MS` (a
 *   positive whole number of milliseconds) and `MCP_TEST_NETWORK_CUT_AT`
 *   (the full name of the test to cut in, as node:test names it). With
 *   neither set nothing is patched. One without the other, or a value that
 *   is not valid, is refused when the file loads the lock registry.
 * - **Trigger.** In that test, the moment the registry records the first
 *   `held` lock; once per file.
 * - **The cut.** `socketCut`: every open socket destroyed, every new one
 *   refused (`ECONNREFUSED`); it ends after the given milliseconds — the
 *   run's own choice, the only wait here.
 * - **Report.** Its start and end, with the time, on stderr, so a live log
 *   shows which steps ran inside it.
 */
import { installSocketCut } from '../../helpers/socketCut';
import { runningTestName } from './runningTest';

/** What the cut is asked to be, read from the environment. */
export interface NetworkCutPlan {
  readonly ms: number;
  readonly at: string;
}

/**
 * The plan the environment states: `undefined` when neither variable is
 * set; refused when one is missing or the duration is not a positive whole
 * number.
 */
export function networkCutPlan(
  env: NodeJS.ProcessEnv,
): NetworkCutPlan | undefined {
  const rawMs = env.MCP_TEST_NETWORK_CUT_MS;
  const at = env.MCP_TEST_NETWORK_CUT_AT;
  if (rawMs === undefined && at === undefined) return undefined;
  if (rawMs === undefined || at === undefined || at.trim() === '') {
    throw new Error(
      'MCP_TEST_NETWORK_CUT_MS and MCP_TEST_NETWORK_CUT_AT are set together: the duration and the test to cut in',
    );
  }
  const ms = Number(rawMs);
  if (!Number.isInteger(ms) || ms <= 0 || String(ms) !== rawMs.trim()) {
    throw new Error(
      `MCP_TEST_NETWORK_CUT_MS "${rawMs}" is not a positive whole number of milliseconds`,
    );
  }
  return { ms, at: at.trim() };
}

/** Where the cut's start and end are reported. */
type Report = (line: string) => void;
const toStderr: Report = (line) => process.stderr.write(`${line}\n`);

/**
 * Arms the cut the environment plans: `listen` is handed the function to
 * call when a lock is first held. Answers whether it was armed.
 */
export function armNetworkCut(
  env: NodeJS.ProcessEnv,
  listen: (onHeld: () => void) => void,
  report: Report = toStderr,
  testName: () => string | undefined = runningTestName,
): boolean {
  const plan = networkCutPlan(env);
  if (plan === undefined) return false;
  let fired = false;
  listen(() => {
    if (fired || testName() !== plan.at) return;
    fired = true;
    const cut = installSocketCut();
    cut.cut();
    report(
      `[network cut] start ${new Date().toISOString()} in "${plan.at}" for ${plan.ms} ms`,
    );
    setTimeout(() => {
      cut.uninstall();
      report(`[network cut] end ${new Date().toISOString()}`);
    }, plan.ms);
  });
  return true;
}
