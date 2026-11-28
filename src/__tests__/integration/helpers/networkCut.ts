/**
 * The network cut for a live run (#394, spec §8): what proves, on a real
 * system, that a soft-mode run keeps its SAP session through an outage.
 *
 * - **Activation.** Only when the run sets both `MCP_TEST_NETWORK_CUT_REQUESTS`
 *   (a positive whole number: how many connections the cut refuses) and
 *   `MCP_TEST_NETWORK_CUT_AT` (the full name of the test to cut in, as
 *   node:test names it). With neither set nothing is patched. One without the
 *   other, or a count that is not valid, is refused when the file loads the
 *   lock registry.
 * - **Trigger.** In that test, the moment the registry records the first
 *   `held` lock; once per file. The agents are patched when the cut is armed
 *   (file load), so the cut destroys every socket the run opened, the pooled
 *   keep-alive ones included.
 * - **The cut.** `socketCut`: every open socket destroyed, every new one
 *   refused (`ECONNREFUSED`), until that many were refused — then the network
 *   is back. No timer: a live test pauses nowhere (`noLiveBounds.test.ts`),
 *   so the outage is counted in refused connections, not in time.
 * - **Report.** Its start and end, with the time, on stderr, so a live log
 *   shows which steps ran inside it.
 */
import { installSocketCut } from '../../helpers/socketCut';
import { runningTestName } from './runningTest';

/** What the cut is asked to be, read from the environment. */
export interface NetworkCutPlan {
  /** How many connections the cut refuses before the network is back. */
  readonly refused: number;
  readonly at: string;
}

/**
 * The plan the environment states: `undefined` when neither variable is
 * set; refused when one is missing or the count is not a positive whole
 * number.
 */
export function networkCutPlan(
  env: NodeJS.ProcessEnv,
): NetworkCutPlan | undefined {
  const raw = env.MCP_TEST_NETWORK_CUT_REQUESTS;
  const at = env.MCP_TEST_NETWORK_CUT_AT;
  if (raw === undefined && at === undefined) return undefined;
  if (raw === undefined || at === undefined || at.trim() === '') {
    throw new Error(
      'MCP_TEST_NETWORK_CUT_REQUESTS and MCP_TEST_NETWORK_CUT_AT are set together: how many connections to refuse and the test to cut in',
    );
  }
  const refused = Number(raw);
  if (
    !Number.isInteger(refused) ||
    refused <= 0 ||
    String(refused) !== raw.trim()
  ) {
    throw new Error(
      `MCP_TEST_NETWORK_CUT_REQUESTS "${raw}" is not a positive whole number of connections`,
    );
  }
  return { refused, at: at.trim() };
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
  // Patched now, at file load, so every socket the run opens is known and a
  // cut destroys the pooled keep-alive ones too (a patch made at the trigger
  // saw only sockets opened after it, and the pooled ones carried on).
  let refused = 0;
  let ended = false;
  const cut = installSocketCut(() => {
    refused += 1;
    if (refused < plan.refused) return;
    // The last refused socket is already pointed nowhere; from now on new
    // sockets reach their target again.
    cut.restore();
    ended = true;
    report(
      `[network cut] end ${new Date().toISOString()} after ${refused} refused connection(s)`,
    );
  });
  let fired = false;
  listen(() => {
    if (fired || ended || testName() !== plan.at) return;
    fired = true;
    cut.cut();
    report(
      `[network cut] start ${new Date().toISOString()} in "${plan.at}", until ${plan.refused} connection(s) are refused`,
    );
  });
  return true;
}
