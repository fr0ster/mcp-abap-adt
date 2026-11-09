/**
 * The first interrupt (D27, step 12; P8): the runner starts every file in a
 * process group of its own, so an interrupt sent to the runner's group — a
 * terminal's Ctrl-C — reaches the runner alone. On the first the runner
 * starts no further file and the running file finishes, its cleanup
 * included; a live suite skips its remaining cases with the reason. On the
 * second the runner ends every running file's process tree. Each case runs
 * the runner in a process group of its own over a fixture repository and
 * sends the interrupt to that group, while the fixture waits on a file the
 * case writes.
 *
 * POSIX only: a process group and a signal to it are not Windows', whose
 * console Ctrl-C a test cannot send (step 6 measured Windows by hand).
 */
import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import {
  environment,
  fixtureRepo,
  REPO,
  recorded,
  runTool,
  temporaryDir,
} from './toolRuns';

const scratch = temporaryDir('interrupt-');
after(() => scratch.remove());

const POSIX = process.platform !== 'win32';
const OWN_LIVE = path.join(
  REPO,
  '.test-build',
  'tree',
  'src',
  '__tests__',
  'integration',
  'helpers',
  'live.js',
);

/** What a fixture file shares: a record, and a wait for a file to exist. */
const PRELUDE = [
  "import { appendFileSync, existsSync, watch } from 'node:fs';",
  "import { dirname } from 'node:path';",
  "const record = (word: string) => appendFileSync(process.env.RECORD ?? '', `${word}\\n`);",
  'const until = (file: string) => new Promise<void>((resolve) => {',
  '  if (existsSync(file)) return resolve();',
  '  const watcher = watch(dirname(file), () => {',
  '    if (existsSync(file)) { watcher.close(); resolve(); }',
  '  });',
  '});',
  "const GO = process.env.GO ?? '';",
];

/** Resolves once `file` holds the line `word`. */
function seen(file: string, word: string): Promise<void> {
  return new Promise((resolve) => {
    const check = () => recorded(file).includes(word);
    if (check()) return resolve();
    const watcher = fs.watch(path.dirname(file), () => {
      if (check()) {
        watcher.close();
        resolve();
      }
    });
  });
}

/** The runner over `repo`, in a process group of its own. */
function startRunner(
  repo: string,
  env: Readonly<Record<string, string>>,
): { child: ChildProcess; ended: Promise<number>; output: () => string } {
  let output = '';
  const child = spawn(
    process.execPath,
    [
      path.join(REPO, 'tools', 'run-tests.mjs'),
      '--repo',
      repo,
      '--concurrency',
      '1',
      '--test-reporter=tap',
    ],
    {
      cwd: REPO,
      env: environment(env, ['npm_lifecycle_event']),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout?.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    output += String(chunk);
  });
  const ended = new Promise<number>((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
  });
  return { child, ended, output: () => output };
}

/** An interrupt to the runner's process group, as a terminal sends it. */
function interrupt(child: ChildProcess): void {
  if (child.pid === undefined) throw new Error('the runner has no pid');
  process.kill(-child.pid, 'SIGINT');
}

/** The fixture repository holding `sources`, built. */
function built(
  name: string,
  sources: Readonly<Record<string, string>>,
): string {
  const repo = fixtureRepo(
    path.join(scratch.dir, name),
    Object.keys(sources),
    sources,
  );
  const build = runTool('build-node-tests.mjs', ['--repo', repo]);
  assert.equal(build.status, 0, build.stderr);
  return repo;
}

describe('the first interrupt', {
  skip: POSIX ? false : 'POSIX only: process groups',
}, () => {
  it('a cleanup running at the first interrupt finishes before the run ends', async () => {
    const file = 'src/__tests__/cleanup.test.ts';
    const repo = built('cleanup', {
      [file]: [
        ...PRELUDE,
        "import { after, it } from 'node:test';",
        "after(async () => { record('cleanup started'); await until(GO); record('cleanup finished'); });",
        "it('runs', () => record('case'));",
        '',
      ].join('\n'),
    });
    const record = path.join(scratch.dir, 'cleanup.record');
    const go = path.join(scratch.dir, 'cleanup.go');
    const run = startRunner(repo, { RECORD: record, GO: go });
    await seen(record, 'cleanup started');
    interrupt(run.child);
    // The runner said it waits; the cleanup then goes on to its end.
    await new Promise<void>((resolve) => {
      const check = () => run.output().includes('interrupted');
      if (check()) return resolve();
      run.child.stderr?.on('data', () => {
        if (check()) resolve();
      });
    });
    fs.writeFileSync(go, 'go');
    const code = await run.ended;
    assert.deepEqual(recorded(record), [
      'case',
      'cleanup started',
      'cleanup finished',
    ]);
    // An interrupted run fails.
    assert.equal(code, 1, run.output());
  });

  it("a second interrupt ends every running file's process tree", async () => {
    const file = 'src/__tests__/stuck.test.ts';
    const repo = built('stuck', {
      [file]: [
        ...PRELUDE,
        "import { after, it } from 'node:test';",
        "after(async () => { record(`pid ${process.pid}`); record('cleanup started'); await until(GO); record('cleanup finished'); });",
        "it('runs', () => record('case'));",
        '',
      ].join('\n'),
    });
    const record = path.join(scratch.dir, 'stuck.record');
    // Never written: the cleanup waits until it is stopped.
    const go = path.join(scratch.dir, 'stuck.never');
    const run = startRunner(repo, { RECORD: record, GO: go });
    await seen(record, 'cleanup started');
    interrupt(run.child);
    await new Promise<void>((resolve) => {
      const check = () => run.output().includes('interrupted');
      if (check()) return resolve();
      run.child.stderr?.on('data', () => {
        if (check()) resolve();
      });
    });
    interrupt(run.child);
    const code = await run.ended;
    assert.equal(code, 1);
    assert.equal(recorded(record).includes('cleanup finished'), false);
    const pid = Number(
      (recorded(record).find((line) => line.startsWith('pid ')) ?? '').slice(4),
    );
    assert.ok(pid > 0);
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  });

  it('a live suite interrupted during its first case finishes it and its cleanup, skips the rest, and no further file starts', async () => {
    const first = 'src/__tests__/a-live.test.ts';
    const second = 'src/__tests__/b-later.test.ts';
    const repo = built('suite', {
      [first]: [
        ...PRELUDE,
        "import { after, it } from 'node:test';",
        // This repository's own live helpers, on a stub runner.
        'const live: unknown = require(process.env.LIVE_HELPERS ?? "");',
        "const liveDescribe = typeof live === 'object' && live !== null ? Reflect.get(live, 'liveDescribe') : undefined;",
        "if (typeof liveDescribe !== 'function') throw new Error('no liveDescribe');",
        "const runner = { system: 'onprem', user: 'U', call: async () => ({ isError: false, content: [], text: '' }), connection: () => { throw new Error('none'); }, close: async () => {} };",
        "Reflect.apply(liveDescribe, undefined, ['three cases', async () => runner, async () => {}, () => {",
        "  after(() => record('cleanup'));",
        "  it('one', async () => { record('one started'); await until(GO); record('one finished'); });",
        "  it('two', () => record('two ran'));",
        "  it('three', () => record('three ran'));",
        '}]);',
        '',
      ].join('\n'),
      [second]: [
        ...PRELUDE,
        "import { it } from 'node:test';",
        "it('later', () => record('later ran'));",
        '',
      ].join('\n'),
    });
    const record = path.join(scratch.dir, 'suite.record');
    const go = path.join(scratch.dir, 'suite.go');
    const run = startRunner(repo, {
      RECORD: record,
      GO: go,
      LIVE_HELPERS: OWN_LIVE,
    });
    await seen(record, 'one started');
    interrupt(run.child);
    await new Promise<void>((resolve) => {
      const check = () => run.output().includes('interrupted');
      if (check()) return resolve();
      run.child.stderr?.on('data', () => {
        if (check()) resolve();
      });
    });
    fs.writeFileSync(go, 'go');
    const code = await run.ended;
    assert.equal(code, 1, run.output());
    // The case running at the interrupt finished; the cleanup ran; the
    // other two did nothing of their own; the second file never started.
    assert.deepEqual(
      recorded(record).filter(
        (line) => line !== 'two ran' && line !== 'three ran',
      ),
      ['one started', 'one finished', 'cleanup'],
    );
    const tap = run.output();
    assert.ok(tap.includes('two # SKIP the run was interrupted'), tap);
    assert.ok(tap.includes('three # SKIP the run was interrupted'), tap);
    assert.equal(recorded(record).includes('later ran'), false);
  });
});
