/**
 * The run's coverage reporter (spec §8, "Live": a live key is covered only
 * after its test passed): named in `test:integration` and
 * `test:coverage-family` beside Jest's default reporter.
 *
 * `onTestCaseResult` receives Jest's **completed** result of each test —
 * after its `afterEach` hooks and after `expect.assertions` is checked,
 * which a hook of the test itself cannot see — and joins it with the call
 * log by file and full name: every key the test called gets the test's
 * outcome on the system it ran on. `onTestFileResult` records each file
 * that ran, by its repository path, for a family run's scope.
 * `globalTeardown` reads what it wrote.
 *
 * Node loads a reporter itself, outside ts-jest: this file and
 * `reportFormat.ts` are compiled by `npm run build:test-reporter` to
 * `build/test-reporter/` before a run, and import nothing else.
 */

import * as path from 'node:path';
import {
  appendFileRan,
  appendOutcome,
  type KeyOutcome,
  readCallLog,
} from './reportFormat';

/** What the reporter reads of Jest's global configuration. */
interface ReporterConfig {
  rootDir: string;
}

/** What the reporter reads of a test file Jest ran. */
interface RanFile {
  path: string;
}

/** What the reporter reads of one test's completed result. */
interface CompletedTest {
  fullName: string;
  status: string;
}

const outcomeOf = (status: string): KeyOutcome =>
  status === 'passed' ? 'passed' : status === 'failed' ? 'failed' : 'skipped';

export default class CoverageReporter {
  private readonly root: string;

  constructor(globalConfig: ReporterConfig) {
    this.root = globalConfig.rootDir;
  }

  onTestCaseResult(test: RanFile, result: CompletedTest): void {
    const outcome = outcomeOf(result.status);
    for (const entry of readCallLog()) {
      if (entry.file !== test.path || entry.test !== result.fullName) continue;
      appendOutcome({ key: entry.key, system: entry.system, outcome });
    }
  }

  onTestFileResult(test: RanFile): void {
    appendFileRan(
      path.relative(this.root, test.path).split(path.sep).join('/'),
    );
  }
}
