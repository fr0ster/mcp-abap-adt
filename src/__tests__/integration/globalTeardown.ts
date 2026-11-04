/**
 * Jest Global Teardown: the run report against the ledger (spec §8,
 * acceptance 3; plan C2).
 *
 * The running npm script decides the scope (`npm_lifecycle_event`):
 * - `test:integration` — the full run: every key the ledger requires on the
 *   configured system must have passed;
 * - `test:coverage-family` — a family run: only the keys whose live file on
 *   that system is one of the files that ran;
 * - anything else (the unit tests' `npm test`) — nothing is checked.
 *
 * A run whose credential was refused fails. Without a test config nothing
 * ran live, and nothing is checked; with one, the system kind must be stated.
 */

import {
  markerExists,
  readFilesRan,
  readLeftovers,
  readOutcomes,
} from './coverageReport/reportFormat';
import {
  configuredSystemKindOf,
  NO_KIND_STATED,
} from './helpers/configuredSystemKind';
import { loadRunConfig } from './helpers/runConfig';
import {
  checkRunReport,
  type RunScope,
  readLedger,
  reportPath,
  runScriptOf,
} from './helpers/runReport';

/** What the teardown reads of Jest's global configuration. */
export interface TeardownConfig {
  rootDir: string;
}

export default async function globalTeardown(
  globalConfig: TeardownConfig,
): Promise<void> {
  const script = runScriptOf(process.env.npm_lifecycle_event);
  if (script === undefined) return;
  const left = readLeftovers();
  if (left.length > 0) {
    console.log(
      `[globalTeardown] left behind for the owner to remove:\n${left.join('\n')}`,
    );
  }
  if (markerExists()) {
    throw new Error(
      `[globalTeardown] a credential was refused in this run; nothing was sent after it (run report: ${reportPath()})`,
    );
  }
  const config = loadRunConfig();
  if (config === undefined || config === null) {
    console.log(
      '[globalTeardown] no test config: nothing ran live, the run report is not checked',
    );
    return;
  }
  const kind = configuredSystemKindOf(config);
  if (kind === undefined) throw new Error(`[globalTeardown] ${NO_KIND_STATED}`);
  if (kind === 'legacy') {
    console.log(
      '[globalTeardown] the configured system is legacy: the coverage ledger covers onprem and cloud, the run report is not checked',
    );
    return;
  }
  const scope: RunScope =
    script === 'full'
      ? { kind: 'full' }
      : { kind: 'family', files: readFilesRan() };
  const problems = checkRunReport({
    ledger: readLedger(globalConfig.rootDir),
    outcomes: readOutcomes(),
    system: kind,
    scope,
  });
  console.log(`[globalTeardown] run report: ${reportPath()}`);
  if (problems.length > 0) {
    throw new Error(
      `[globalTeardown] ${problems.length} required key(s) did not pass on ${kind}:\n${problems.join('\n')}`,
    );
  }
}
