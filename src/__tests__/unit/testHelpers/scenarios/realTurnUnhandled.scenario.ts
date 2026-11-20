/**
 * A plain-node scenario for `unit/testHelpers/fakeTime.test.ts`: a
 * rejection left without a handler reaches `unhandledRejection` before
 * `realTurn()` resolves — the reason a test settles with a real turn. Run
 * by `process.execPath` on its compiled file (no test runner: node:test's
 * own handler would fail the case on the rejection); it writes what it saw
 * as one JSON line on stdout. The test imports this module only for its
 * path, so the build compiles it.
 */
import { realTurn } from '../../../helpers/fakeTime';

/** The compiled file of this scenario, for the test to run. */
export const REAL_TURN_UNHANDLED = __filename;

async function scenario(): Promise<void> {
  const seen: string[] = [];
  process.on('unhandledRejection', (reason) => {
    seen.push(reason instanceof Error ? reason.message : String(reason));
  });
  Promise.reject(new Error('left unhandled'));
  await realTurn();
  const seenBeforeResolve = [...seen];
  process.stdout.write(`${JSON.stringify({ seenBeforeResolve })}\n`);
}

if (require.main === module) {
  scenario().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
