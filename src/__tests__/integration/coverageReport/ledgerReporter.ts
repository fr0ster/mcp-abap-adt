/**
 * The run's ledger reporter (spec §3, §8 "Live": a live key is covered only
 * after its test passed): a node:test reporter (`--test-reporter`), named in
 * `test:integration` and `test:coverage-family` beside the `spec` reporter,
 * compiled with the node:test build.
 *
 * It reads each test's final event, which node:test emits once the test's
 * own hooks have run: `test:pass` is `passed`, or `skipped` when it carries
 * `skip` or `todo`; `test:fail` is `failed`, a cancelled test included. It
 * rebuilds the test's name path from the titles of the `test:start` events
 * above it (`namePath`, the string `t.fullName` is) and joins it with the
 * call log by `testKey`: every key the test called gets its outcome on the
 * system it ran on. A test of a file whose process ended before reporting it
 * gets no outcome — its keys stay `not run`. Every file that ran is recorded
 * by its repository source path, for a family run's scope: from node:test's
 * own entry for the file (`test:dequeue`, named by the file), so a file whose
 * suite skipped is recorded too. Live files run one at a time (the live
 * scripts' `--concurrency 1`): the name path is read off one stack of open
 * titles. The runner's
 * teardown reads what it wrote. It writes nothing to its own output.
 */

import * as path from 'node:path';
import type { TestEvent } from 'node:test/reporters';
import { repositoryRoot } from '../../helpers/repoRoot';
import {
  appendFileRan,
  appendOutcome,
  type KeyOutcome,
  namePath,
  readCallLog,
  sourcePathOf,
  testKey,
} from './reportFormat';

/** A test's outcome from its final event. */
function outcomeOf(
  failed: boolean,
  marks: { skip?: string | boolean; todo?: string | boolean },
): KeyOutcome {
  if (failed) return 'failed';
  return marks.skip !== undefined || marks.todo !== undefined
    ? 'skipped'
    : 'passed';
}

async function* ledgerReporter(
  source: AsyncIterable<TestEvent>,
): AsyncGenerator<string, void> {
  const root = repositoryRoot(__dirname);
  /** The titles of the tests open at each nesting level. */
  const titles: string[] = [];
  for await (const event of source) {
    if (event.type === 'test:dequeue') {
      // A file node:test starts: its own entry, named by its file (a test
      // inside it is named by its title).
      const { file, name, nesting } = event.data;
      if (
        nesting === 0 &&
        file !== undefined &&
        path.resolve(name) === path.resolve(file)
      ) {
        appendFileRan(sourcePathOf(file, root));
      }
      continue;
    }
    if (event.type === 'test:start') {
      titles.length = event.data.nesting;
      titles.push(event.data.name);
      continue;
    }
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const done = event.data;
    if (done.details.type === 'suite' || done.file === undefined) continue;
    // The case's file is where its `it` is: the live file itself.
    const key = testKey(
      sourcePathOf(done.file, root),
      namePath([...titles.slice(0, done.nesting), done.name]),
    );
    const outcome = outcomeOf(event.type === 'test:fail', done);
    for (const entry of readCallLog()) {
      if (testKey(entry.file, entry.test) !== key) continue;
      appendOutcome({ key: entry.key, system: entry.system, outcome });
    }
  }
  // It writes nothing of its own: the `spec` reporter beside it does.
  yield '';
}

export = ledgerReporter;
