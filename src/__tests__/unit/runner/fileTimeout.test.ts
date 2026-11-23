/**
 * The per-file bound of the unit run (`--file-timeout <seconds>`), end to
 * end through the runner over fixture repositories: a file whose process
 * runs past it has its whole process tree ended — a grandchild in a session
 * of its own included —, is named on stderr with the last test it started
 * once its close is seen, and fails the run; the other files still run, and
 * the run's end lists every file stopped. Files that end within the bound
 * are untouched, and a finished file's timer never stops another file. No
 * file inherits the runner's marker variable. The bound is refused above
 * 2147483 s, under a live npm script, and for a live or integration file
 * however `--repo` names it. The parts are tested one by one in
 * `fileBoundParts.test.ts`.
 *
 * A file that never ends holds an interval it does not unreference, and so
 * does the grandchild it starts; each ends itself after `FALLBACK_MS` and
 * records it, so a runner that does not end them fails this test instead of
 * hanging it.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import {
  environment,
  fixtureRepo,
  nodeTestSource,
  REPO,
  recorded,
  runTool,
  temporaryDir,
} from './toolRuns';

const scratch = temporaryDir('file-timeout-');
after(() => scratch.remove());

/** Seconds: long enough for a file to start its test on a slow runner. */
const BOUND = 10;
/** When a file or grandchild the runner failed to end ends itself. */
const FALLBACK_MS = 40_000;

const HANGS_A = 'src/__tests__/a-hangs.test.ts';
const HANGS_B = 'src/__tests__/b-hangs.test.ts';
const FINE = 'src/__tests__/c-fine.test.ts';

/**
 * A grandchild (`grandchild.cjs`, plain node): says `grandchild <name>` on
 * `$HOLD_PORT`, holds an interval, and after the fallback records that it
 * ended by itself and exits.
 */
const GRANDCHILD = [
  "const { appendFileSync } = require('node:fs');",
  "const { connect } = require('node:net');",
  'const name = process.argv[2];',
  'const ticks = setInterval(() => {}, 1000);',
  "const socket = connect(Number(process.env.HOLD_PORT), '127.0.0.1');",
  "socket.on('error', () => undefined);",
  "socket.write('grandchild ' + name + '\\n');",
  'setTimeout(() => {',
  "  appendFileSync(process.env.RECORD, 'grandchild ' + name + ' ended by itself\\n');",
  '  clearInterval(ticks);',
  '  socket.destroy();',
  `}, ${FALLBACK_MS});`,
  '',
].join('\n');

/**
 * A file whose test starts a grandchild in a session (POSIX) or console
 * (Windows) of its own, then never ends until its fallback.
 */
function hangsSource(name: string): string {
  return [
    "import { spawn } from 'node:child_process';",
    "import { appendFileSync } from 'node:fs';",
    "import { it } from 'node:test';",
    "it('starts first', () => {});",
    `it('never ends ${name}', async () => {`,
    "  const grandchild = spawn(process.execPath, [process.env.GRANDCHILD ?? '', '" +
      name +
      "'], { detached: true, stdio: 'ignore' });",
    '  grandchild.unref();',
    '  const ticks = setInterval(() => {}, 1000);',
    `  await new Promise((resolve) => setTimeout(resolve, ${FALLBACK_MS}));`,
    `  appendFileSync(process.env.RECORD ?? '', '${name} ended by itself\\n');`,
    '  clearInterval(ticks);',
    '});',
    '',
  ].join('\n');
}

/** The fixture repository holding `sources`, built. */
function built(
  name: string,
  sources: Readonly<Record<string, string>>,
): string {
  const repo = fixtureRepo(path.join(scratch.dir, name), sources);
  const build = runTool('build-node-tests.mjs', ['--repo', repo]);
  assert.equal(build.status, 0, build.stderr);
  return repo;
}

/** The runner over a fixture, in the unit run's environment. */
function runner(
  args: readonly string[],
  set: Readonly<Record<string, string>> = {},
) {
  return runTool(
    'run-tests.mjs',
    args,
    environment(set, ['npm_lifecycle_event']),
  );
}

describe('the per-file bound', () => {
  it('ends two files that run past it, their grandchildren too, names each with its last test, runs the rest, and fails the run', async () => {
    const server = net.createServer();
    const heard: string[] = [];
    const closes: Promise<void>[] = [];
    server.on('connection', (socket) => {
      socket.on('error', () => undefined);
      closes.push(
        new Promise((resolve) => {
          socket.on('close', () => resolve());
        }),
      );
      socket.on('data', (data) => {
        heard.push(...String(data).split('\n').filter(Boolean));
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert.ok(typeof address === 'object' && address !== null);
    const repo = built('hangs', {
      [HANGS_A]: hangsSource('a'),
      [HANGS_B]: hangsSource('b'),
      [FINE]: nodeTestSource('fine', 'NEVER'),
      'grandchild.cjs': GRANDCHILD,
    });
    const record = path.join(scratch.dir, 'hangs.record');
    let stdout = '';
    let stderr = '';
    const child = spawn(
      process.execPath,
      [
        path.join(REPO, 'tools', 'run-tests.mjs'),
        '--repo',
        repo,
        '--concurrency',
        '2',
        '--file-timeout',
        String(BOUND),
        '--test-reporter=tap',
      ],
      {
        cwd: REPO,
        env: environment(
          {
            RECORD: record,
            HOLD_PORT: String(address.port),
            GRANDCHILD: path.join(repo, 'grandchild.cjs'),
          },
          ['npm_lifecycle_event'],
        ),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    const code = await new Promise<number>((resolve) => {
      child.on('close', (status) => resolve(status ?? 1));
    });
    // Every grandchild's connection is closed: killed, or ended by itself.
    await Promise.all(closes);
    server.close();
    const both = `stdout:\n${stdout}\nstderr:\n${stderr}`;
    assert.deepEqual(heard.sort(), ['grandchild a', 'grandchild b'], both);
    // Nothing ended by itself: the bound ended both files and both
    // grandchildren; the file after them ran.
    assert.deepEqual(recorded(record), ['fine'], both);
    assert.equal(code, 1, both);
    for (const [file, name] of [
      [HANGS_A, 'a'],
      [HANGS_B, 'b'],
    ]) {
      assert.ok(
        stderr.includes(
          `run-tests: ${file} ran past the bound of ${BOUND} s and was stopped; the last test started: never ends ${name}\n`,
        ),
        both,
      );
    }
    const header = `run-tests: 2 files ran past the bound of ${BOUND} s:\n`;
    const at = stderr.indexOf(header);
    assert.ok(at >= 0, both);
    assert.deepEqual(
      stderr
        .slice(at + header.length)
        .split('\n')
        .filter(Boolean)
        .sort(),
      [`  stopped: ${HANGS_A}`, `  stopped: ${HANGS_B}`],
      both,
    );
    // The runner's words are on stderr alone; the reports on stdout.
    assert.equal(stdout.includes('run-tests:'), false, both);
    assert.ok(stdout.includes('ok 1 - fine'), both);
  });

  it("leaves files that end within it untouched, and clears each file's timer when it ends", () => {
    // `a` ends at once; `b` and `c` each take 8 s, each well within the
    // 15 s bound. A timer left running after `a` ends would expire while
    // `c` runs, and stop and name `a`.
    const waits = (word: string) =>
      [
        "import { appendFileSync } from 'node:fs';",
        "import { it } from 'node:test';",
        `it('${word}', async () => {`,
        '  await new Promise((resolve) => setTimeout(resolve, 8000));',
        `  appendFileSync(process.env.RECORD ?? '', '${word}\\n');`,
        '});',
        '',
      ].join('\n');
    const repo = built('fine', {
      'src/__tests__/a.test.ts': nodeTestSource('a', 'NEVER'),
      'src/__tests__/b.test.ts': waits('b'),
      'src/__tests__/c.test.ts': waits('c'),
    });
    const record = path.join(scratch.dir, 'fine.record');
    const run = runner(
      [
        '--repo',
        repo,
        '--concurrency',
        '1',
        '--file-timeout',
        '15',
        '--test-reporter=tap',
      ],
      { RECORD: record },
    );
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.deepEqual(recorded(record), ['a', 'b', 'c']);
    assert.equal(run.stderr.includes('bound'), false, run.stderr);
  });

  it("gives no file the marker the runner's own environment holds", () => {
    const repo = built('marker', { [FINE]: nodeTestSource('fine', 'NEVER') });
    const marker = path.join(scratch.dir, 'inherited-marker');
    const record = path.join(scratch.dir, 'marker.record');
    const run = runner(
      ['--repo', repo, '--concurrency', '1', '--test-reporter=tap'],
      { RECORD: record, MCP_ABAP_ADT_STARTED_FILE: marker },
    );
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.deepEqual(recorded(record), ['fine']);
    assert.equal(fs.existsSync(marker), false);
  });

  it('refuses a bound that is not a positive integer of seconds up to 2147483', () => {
    for (const value of ['0', '-1', '1.5', 'x', '', '2147484', '99999999999']) {
      const run = runner([
        '--concurrency',
        '1',
        '--file-timeout',
        value,
        '--list',
      ]);
      assert.equal(run.status, 1, value);
      assert.ok(run.stderr.includes('--file-timeout'), run.stderr);
    }
    const largest = runner([
      '--concurrency',
      '1',
      '--file-timeout',
      '2147483',
      '--list',
    ]);
    assert.equal(largest.status, 0, largest.stderr);
  });

  it('is refused under a live npm script: a live run has no bound', () => {
    const run = runTool(
      'run-tests.mjs',
      ['--concurrency', '1', '--file-timeout', '60', '--list'],
      environment({ npm_lifecycle_event: 'test:integration' }),
    );
    assert.equal(run.status, 1, run.stdout);
    assert.ok(run.stderr.includes('live npm script'), run.stderr);
  });

  it('is refused for a live or integration file, however --repo names it', () => {
    const live = 'src/__tests__/integration/x.test.ts';
    const repo = built('live', { [live]: nodeTestSource('live', 'NEVER') });
    const compiled = path.join(
      repo,
      '.test-build',
      'tree',
      'src',
      '__tests__',
      'integration',
      'x.test.js',
    );
    const record = path.join(scratch.dir, 'live.record');
    const run = runner(
      [
        '--repo',
        path.dirname(repo),
        '--concurrency',
        '1',
        '--file-timeout',
        '60',
        compiled,
      ],
      { RECORD: record },
    );
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.ok(
      run.stderr.includes(
        '--file-timeout is refused for a live or integration file',
      ),
      run.stderr,
    );
    assert.deepEqual(recorded(record), []);
  });
  it('reports a file whose tree could not be ended as kill failed, without waiting on it', {
    skip:
      process.platform === 'win32'
        ? 'POSIX only: the failure is a process table that cannot be read (a fake ps on PATH); no safe failing taskkill exists to fake on Windows'
        : false,
  }, () => {
    // Its grandchild ends at once: the group kill alone ends the file.
    const repo = built('unkillable', {
      [HANGS_A]: hangsSource('a'),
      'grandchild.cjs': '',
    });
    // The only `ps` on the path fails: the group is still killed, but the
    // tree cannot be known whole, so the kill failed.
    const fakes = path.join(scratch.dir, 'fake-ps');
    fs.mkdirSync(fakes, { recursive: true });
    fs.writeFileSync(path.join(fakes, 'ps'), '#!/bin/sh\nexit 1\n', {
      mode: 0o755,
    });
    const record = path.join(scratch.dir, 'unkillable.record');
    const run = runner(
      [
        '--repo',
        repo,
        '--concurrency',
        '1',
        '--file-timeout',
        String(BOUND),
        '--test-reporter=tap',
      ],
      {
        RECORD: record,
        PATH: fakes,
        GRANDCHILD: path.join(repo, 'grandchild.cjs'),
      },
    );
    const both = `stdout:\n${run.stdout}\nstderr:\n${run.stderr}`;
    assert.equal(run.status, 1, both);
    assert.ok(
      run.stderr.includes(
        `run-tests: ${HANGS_A} ran past the bound of ${BOUND} s and could not be stopped: ps exited 1`,
      ),
      both,
    );
    assert.ok(
      run.stderr.includes(
        `run-tests: 1 file ran past the bound of ${BOUND} s:\n  kill failed: ${HANGS_A}\n`,
      ),
      both,
    );
    assert.equal(run.stderr.includes('\n  stopped: '), false, both);
  });

  it('refuses a live file named in another case on Windows, with or without the bound', {
    skip:
      process.platform === 'win32'
        ? false
        : 'Windows only: its file system names one file in any case',
  }, () => {
    const live = 'src/__tests__/integration/x.test.ts';
    const repo = built('cased', { [live]: nodeTestSource('cased', 'NEVER') });
    const record = path.join(scratch.dir, 'cased.record');
    const source = path.join(
      repo,
      'SRC',
      '__TESTS__',
      'INTEGRATION',
      'x.test.ts',
    );
    assert.ok(fs.existsSync(source), 'this drive names files case-sensitively');
    const unbounded = runner(['--repo', repo, '--concurrency', '1', source], {
      RECORD: record,
    });
    assert.equal(unbounded.status, 1, unbounded.stdout + unbounded.stderr);
    assert.ok(
      unbounded.stderr.includes(
        'a live suite runs only under a live npm script',
      ),
      unbounded.stderr,
    );
    const compiled = path.join(
      repo,
      '.TEST-BUILD',
      'Tree',
      'Src',
      '__Tests__',
      'Integration',
      'x.test.js',
    );
    const bounded = runner(
      [
        '--repo',
        path.dirname(repo),
        '--concurrency',
        '1',
        '--file-timeout',
        '60',
        compiled,
      ],
      { RECORD: record },
    );
    assert.equal(bounded.status, 1, bounded.stdout + bounded.stderr);
    assert.ok(
      bounded.stderr.includes(
        '--file-timeout is refused for a live or integration file',
      ),
      bounded.stderr,
    );
    assert.deepEqual(recorded(record), []);
  });
});
