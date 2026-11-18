// Count, title and pin-map parity for the node:test move (spec §8):
// `npm run test:parity -- <command> …`, after the test build
// (`npm run test:build`, which the npm script runs first).
//
//   record <file>...  Every named file must be a Jest file (a `….test.ts`
//                     that exists and is not on the node:test list). Runs Jest
//                     over them by path (the root configuration, `--json`)
//                     and writes, per file, `.test-parity/<path>.json`: the
//                     ordered list of full titles (ancestors and title joined
//                     by ` > `), each with its status (`passed`, `failed`,
//                     `skipped`), and the count. A failed test is recorded,
//                     not refused; a file Jest could not run is refused.
//   check <file>...   Every named file must be on the node:test list and have
//                     a record. Runs each through the runner with
//                     `tools/test-parity-reporter.mjs` to a temporary file and
//                     compares it with the record (`compareTitles`): the same
//                     count, the same titles in the same order, the same
//                     status per title. Every difference is printed, per file,
//                     and the run exits 1.
//   pins <out.json>   Runs the coverage guard (`coverageLedger.test.ts`)
//                     through the runner with `LEDGER_MAP_OUT=<out.json>`: the
//                     guard writes its computed key → pin and key → live maps
//                     there.
//
// `compareTitles(before, after)` is exported, pure, for its test
// (`src/__tests__/unit/runner/testParity.test.ts`); the command line runs
// only when this file is the program.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OWN_REPO, readList } from './node-test-list.mjs';

const RECORDS = join(OWN_REPO, '.test-parity');
const REPORTER = join(OWN_REPO, 'tools', 'test-parity-reporter.mjs');
const LEDGER_GUARD = 'src/__tests__/unit/coverage/coverageLedger.test.ts';

/** `"title" (status)` for a difference line. */
const shown = (test) => `"${test.title}" (${test.status})`;

/** How many times each title occurs in `tests`. */
function tally(tests) {
  const counts = new Map();
  for (const test of tests) {
    counts.set(test.title, (counts.get(test.title) ?? 0) + 1);
  }
  return counts;
}

/**
 * The differences between two records (`{ count, tests: [{ title, status }] }`),
 * one line each; `[]` when they are equal: the same count, the same titles
 * in the same order, the same status per title.
 */
export function compareTitles(before, after) {
  const lines = [];
  if (before.count !== after.count) {
    lines.push(`count: ${before.count} before, ${after.count} after`);
  }
  for (const record of [before, after]) {
    if (record.count !== record.tests.length) {
      lines.push(
        `count: ${record.count} stated, ${record.tests.length} listed (${record === before ? 'before' : 'after'})`,
      );
    }
  }
  const beforeTally = tally(before.tests);
  const afterTally = tally(after.tests);
  const missing = [];
  const extra = [];
  for (const [title, count] of beforeTally) {
    const left = count - (afterTally.get(title) ?? 0);
    for (let i = 0; i < left; i += 1) missing.push(title);
  }
  for (const [title, count] of afterTally) {
    const left = count - (beforeTally.get(title) ?? 0);
    for (let i = 0; i < left; i += 1) extra.push(title);
  }
  // A missing and an extra title at the same position read as a rename.
  const length = Math.max(before.tests.length, after.tests.length);
  for (let i = 0; i < length; i += 1) {
    const was = before.tests[i];
    const now = after.tests[i];
    if (was === undefined || now === undefined || was.title === now.title) {
      continue;
    }
    const m = missing.indexOf(was.title);
    const e = extra.indexOf(now.title);
    if (m >= 0 && e >= 0) {
      missing.splice(m, 1);
      extra.splice(e, 1);
      lines.push(`renamed at #${i + 1}: "${was.title}" → "${now.title}"`);
    }
  }
  for (const title of missing) lines.push(`missing: "${title}"`);
  for (const title of extra) lines.push(`extra: "${title}"`);
  // Order: the titles both records hold, in each record's order.
  const kept = (tests, other) => tests.filter((test) => other.has(test.title));
  const keptBefore = kept(before.tests, afterTally);
  const keptAfter = kept(after.tests, beforeTally);
  const pairs = Math.min(keptBefore.length, keptAfter.length);
  for (let i = 0; i < pairs; i += 1) {
    if (keptBefore[i].title !== keptAfter[i].title) {
      lines.push(
        `order: at #${i + 1} of the common titles ${shown(keptBefore[i])} before, ${shown(keptAfter[i])} after`,
      );
      break;
    }
  }
  // Status per title, occurrence by occurrence.
  const statuses = (tests) => {
    const byTitle = new Map();
    for (const test of tests) {
      byTitle.set(test.title, [
        ...(byTitle.get(test.title) ?? []),
        test.status,
      ]);
    }
    return byTitle;
  };
  const afterStatuses = statuses(after.tests);
  for (const [title, was] of statuses(before.tests)) {
    const now = afterStatuses.get(title) ?? [];
    for (let i = 0; i < Math.min(was.length, now.length); i += 1) {
      if (was[i] !== now[i]) {
        lines.push(`status: "${title}" ${was[i]} before, ${now[i]} after`);
      }
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// The command line

function fail(words) {
  console.error(`test-parity: ${words}`);
  process.exit(1);
}

/** A named file as a repository source path (`/`-separated), required to exist. */
function sourcePath(file) {
  const full = resolve(file);
  const rel = relative(OWN_REPO, full);
  if (
    rel === '' ||
    rel.startsWith(`..${sep}`) ||
    rel === '..' ||
    isAbsolute(rel)
  ) {
    fail(`${file}: not under the repository`);
  }
  if (!full.endsWith('.test.ts')) fail(`${file}: not a ….test.ts file`);
  if (statSync(full, { throwIfNoEntry: false })?.isFile() !== true) {
    fail(`${file}: no such file`);
  }
  return rel.split(sep).join('/');
}

const recordFile = (source) => join(RECORDS, ...`${source}.json`.split('/'));

/** Jest's status of an assertion, as the record names it. */
function jestStatus(status) {
  if (status === 'passed') return 'passed';
  if (status === 'failed') return 'failed';
  return 'skipped';
}

function record(files) {
  const listed = new Set(readList(OWN_REPO));
  const sources = files.map(sourcePath);
  for (const source of sources) {
    if (listed.has(source)) {
      fail(`${source}: on the node:test list, not a Jest file`);
    }
  }
  const scratch = mkdtempSync(join(tmpdir(), 'test-parity-'));
  try {
    const output = join(scratch, 'jest.json');
    const jest = createRequire(import.meta.url).resolve('jest/bin/jest');
    const run = spawnSync(
      process.execPath,
      [
        jest,
        `--config=${join(OWN_REPO, 'jest.config.js')}`,
        '--json',
        `--outputFile=${output}`,
        '--runTestsByPath',
        ...sources.map((source) => join(OWN_REPO, ...source.split('/'))),
      ],
      { cwd: OWN_REPO, stdio: ['ignore', 'inherit', 'inherit'] },
    );
    if (run.error !== undefined) fail(`Jest did not start: ${run.error}`);
    if (!existsSync(output)) fail('Jest wrote no result');
    const result = JSON.parse(readFileSync(output, 'utf8'));
    for (const source of sources) {
      const full = join(OWN_REPO, ...source.split('/'));
      const fileResult = result.testResults.find(
        (each) => resolve(each.name) === full,
      );
      if (fileResult === undefined) fail(`${source}: Jest ran no such file`);
      if (
        fileResult.testExecError !== undefined &&
        fileResult.testExecError !== null
      ) {
        fail(`${source}: Jest could not run it: ${fileResult.message}`);
      }
      if (fileResult.assertionResults.length === 0) {
        fail(`${source}: Jest found no test in it: ${fileResult.message}`);
      }
      const tests = fileResult.assertionResults.map((assertion) => ({
        title: [...assertion.ancestorTitles, assertion.title].join(' > '),
        status: jestStatus(assertion.status),
      }));
      const out = recordFile(source);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(
        out,
        `${JSON.stringify({ count: tests.length, tests }, null, 2)}\n`,
      );
      console.log(`test-parity: recorded ${tests.length} test(s) of ${source}`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** `node tools/run-tests.mjs …args`; its status. */
function runner(args) {
  const run = spawnSync(
    process.execPath,
    [join(OWN_REPO, 'tools', 'run-tests.mjs'), '--concurrency', '1', ...args],
    { cwd: OWN_REPO, stdio: ['ignore', 'inherit', 'inherit'] },
  );
  if (run.error !== undefined) fail(`the runner did not start: ${run.error}`);
  return run.status;
}

function check(files) {
  const listed = new Set(readList(OWN_REPO));
  const sources = files.map(sourcePath);
  for (const source of sources) {
    if (!listed.has(source)) fail(`${source}: not on the node:test list`);
    if (!existsSync(recordFile(source))) {
      fail(
        `${source}: no record — run \`npm run test:parity -- record\` first`,
      );
    }
  }
  const scratch = mkdtempSync(join(tmpdir(), 'test-parity-'));
  let differs = false;
  try {
    sources.forEach((source, index) => {
      const out = join(scratch, `${index}.json`);
      runner([
        `--test-reporter=${pathToFileURL(REPORTER).href}`,
        `--test-reporter-destination=${out}`,
        source,
      ]);
      if (!existsSync(out)) fail(`${source}: the reporter wrote nothing`);
      const before = JSON.parse(readFileSync(recordFile(source), 'utf8'));
      const after = JSON.parse(readFileSync(out, 'utf8'));
      const lines = compareTitles(before, after);
      if (lines.length === 0) {
        console.log(`test-parity: ${source}: ${after.count} test(s), equal`);
      } else {
        differs = true;
        console.error(`test-parity: ${source} differs:`);
        for (const line of lines) console.error(`  ${line}`);
      }
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  if (differs) process.exit(1);
}

function pins(out) {
  if (out === undefined) fail('pins takes the file to write: pins <out.json>');
  const target = resolve(out);
  const status = runner(['--env', `LEDGER_MAP_OUT=${target}`, LEDGER_GUARD]);
  if (status !== 0) fail(`the coverage guard failed (exit ${status})`);
  if (!existsSync(target)) fail(`the coverage guard wrote no ${target}`);
  console.log(
    `test-parity: the key → pin and key → live maps are in ${target}`,
  );
}

function main(args) {
  const [command, ...rest] = args;
  if (command === 'record' || command === 'check') {
    if (rest.length === 0) fail(`${command} takes at least one ….test.ts file`);
    if (command === 'record') record(rest);
    else check(rest);
  } else if (command === 'pins') {
    if (rest.length > 1) fail('pins takes one file');
    pins(rest[0]);
  } else {
    fail(
      'usage: test-parity record <file>... | check <file>... | pins <out.json>',
    );
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2));
}
