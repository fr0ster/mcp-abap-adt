/**
 * The per-file bound of the unit run (`--file-timeout <seconds>`): a file
 * whose process runs past it has its process tree ended, is named on stderr
 * with the last test it started, and fails the run; the files after it still
 * run, and the run's end lists every file stopped. A file that ends within
 * the bound is untouched, and its timer is cleared when it ends, so it never
 * stops another file later. Without the option there is no bound, and under a live npm
 * script the option is refused.
 *
 * The file that never ends holds an interval that is not unreferenced, and a
 * connection to this test that echoes what it is sent. Once the runner has
 * said it stopped the file, a line sent to it is echoed only by a process
 * still running: a killed one closes the connection instead (the kill is
 * sent before the runner's words can reach this test). A survivor is then
 * told to end, so a runner that does not kill fails this test instead of
 * hanging it.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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

/** Seconds: long enough for the file to start its second test on a slow runner. */
const BOUND = 10;

const HANGS = 'src/__tests__/a-hangs.test.ts';
const FINE = 'src/__tests__/b-fine.test.ts';

/** A file whose second test never ends until it hears `go` on `$HOLD_PORT`. */
const HANGS_SOURCE = [
  "import { connect } from 'node:net';",
  "import { it } from 'node:test';",
  "it('starts first', () => {});",
  "it('never ends', async () => {",
  '  const ticks = setInterval(() => {}, 1000);',
  "  const socket = connect(Number(process.env.HOLD_PORT), '127.0.0.1');",
  "  socket.on('error', () => undefined);",
  '  await new Promise<void>((resolve) => {',
  "    socket.on('data', (data) => {",
  "      if (String(data).includes('go')) {",
  '        clearInterval(ticks);',
  '        socket.destroy();',
  '        resolve();',
  '      } else socket.write(data);',
  '    });',
  '  });',
  '});',
  '',
].join('\n');

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

describe('the per-file bound', () => {
  it('ends a file that runs past it, names it and its last test, runs the rest, and fails the run', async (t) => {
    const server = net.createServer();
    const held = new Promise<net.Socket>((resolve) => {
      server.once('connection', resolve);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    t.after(() => server.close());
    const address = server.address();
    assert.ok(typeof address === 'object' && address !== null);
    const repo = built('hangs', {
      [HANGS]: HANGS_SOURCE,
      [FINE]: nodeTestSource('fine', 'NEVER'),
    });
    const record = path.join(scratch.dir, 'hangs.record');
    let output = '';
    const child = spawn(
      process.execPath,
      [
        path.join(REPO, 'tools', 'run-tests.mjs'),
        '--repo',
        repo,
        '--concurrency',
        '1',
        '--file-timeout',
        String(BOUND),
        '--test-reporter=tap',
      ],
      {
        cwd: REPO,
        env: environment({ RECORD: record, HOLD_PORT: String(address.port) }, [
          'npm_lifecycle_event',
        ]),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    const stopped = new Promise<void>((resolve) => {
      child.stderr.on('data', (chunk) => {
        output += String(chunk);
        if (output.includes('was stopped')) resolve();
      });
    });
    const exited = new Promise<number>((resolve) => {
      child.on('close', (code) => resolve(code ?? 1));
    });
    // A runner that ends before the file connects fails here, not by hanging.
    const socket = await Promise.race([held, exited.then(() => undefined)]);
    assert.ok(socket !== undefined, output);
    socket.on('error', () => undefined);
    const closed = new Promise<string>((resolve) => {
      socket.once('close', () => resolve('closed'));
    });
    await stopped;
    const echoed = new Promise<string>((resolve) => {
      socket.once('data', () => resolve('echoed: the file still runs'));
    });
    if (!socket.destroyed) socket.write('alive?');
    const answer = await Promise.race([closed, echoed]);
    // A survivor ends by itself, so the runner ends and the case fails.
    if (answer !== 'closed') socket.write('go');
    const code = await exited;
    assert.equal(answer, 'closed', output);
    assert.equal(code, 1, output);
    assert.ok(
      output.includes(
        `run-tests: ${HANGS} ran past the bound of ${BOUND} s and was stopped; the last test started: never ends`,
      ),
      output,
    );
    // The file after it ran, and the run's end names the stopped file.
    assert.deepEqual(recorded(record), ['fine']);
    assert.ok(
      output.includes(
        `run-tests: 1 file ran past the bound of ${BOUND} s and was stopped:\n  ${HANGS}`,
      ),
      output,
    );
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
    const run = runTool(
      'run-tests.mjs',
      [
        '--repo',
        repo,
        '--concurrency',
        '1',
        '--file-timeout',
        '15',
        '--test-reporter=tap',
      ],
      environment({ RECORD: record }, ['npm_lifecycle_event']),
    );
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.deepEqual(recorded(record), ['a', 'b', 'c']);
    assert.equal(run.stderr.includes('bound'), false, run.stderr);
  });

  it('refuses a bound that is not a positive integer of seconds', () => {
    for (const value of ['0', '-1', '1.5', 'x', '']) {
      const run = runTool(
        'run-tests.mjs',
        ['--concurrency', '1', '--file-timeout', value, '--list'],
        environment({}, ['npm_lifecycle_event']),
      );
      assert.equal(run.status, 1, value);
      assert.ok(run.stderr.includes('--file-timeout'), run.stderr);
    }
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
});
