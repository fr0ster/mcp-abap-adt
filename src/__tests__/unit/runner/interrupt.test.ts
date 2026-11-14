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
import * as net from 'node:net';
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

/**
 * What a fixture file shares: a record, kept in a file for the case's
 * assertions and said, line by line, over a connection to the case; and a
 * wait for the case's `go`, heard on that connection. A file watch is no
 * signal: a write between its first check and the watch's start is missed,
 * and the case waits for ever (a macOS run of CI hung so in the second
 * case). The connection is unreferenced but while a wait holds it, so it
 * keeps no fixture process alive by itself.
 */
const PRELUDE = [
  "import { appendFileSync } from 'node:fs';",
  "import { connect } from 'node:net';",
  "const signal = connect(Number(process.env.SIGNAL_PORT), '127.0.0.1');",
  "signal.on('error', () => undefined);",
  'signal.unref();',
  "let heard = '';",
  'const waiting: (() => void)[] = [];',
  "signal.on('data', (data) => {",
  '  heard += String(data);',
  "  if (heard.includes('go\\n')) for (const wake of waiting.splice(0)) wake();",
  '});',
  'const record = (word: string) => {',
  "  appendFileSync(process.env.RECORD ?? '', `${word}\\n`);",
  '  signal.write(`${word}\\n`);',
  '};',
  'const untilGo = () => new Promise<void>((resolve) => {',
  "  if (heard.includes('go\\n')) return resolve();",
  '  signal.ref();',
  '  waiting.push(() => { signal.unref(); resolve(); });',
  '});',
];

/** The fixtures' connections to the case: what they said, and `go` to them. */
async function signals(): Promise<{
  port: number;
  seen: (word: string) => Promise<void>;
  go: () => void;
  close: () => void;
}> {
  const server = net.createServer();
  const sockets: net.Socket[] = [];
  const lines: string[] = [];
  let pending = '';
  const waits: { word: string; resolve: () => void }[] = [];
  server.on('connection', (socket) => {
    sockets.push(socket);
    socket.on('error', () => undefined);
    socket.on('data', (data) => {
      pending += String(data);
      const parts = pending.split('\n');
      pending = parts.pop() ?? '';
      lines.push(...parts);
      for (const wait of [...waits]) {
        if (lines.includes(wait.word)) {
          waits.splice(waits.indexOf(wait), 1);
          wait.resolve();
        }
      }
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(typeof address === 'object' && address !== null);
  return {
    port: address.port,
    seen: (word) =>
      new Promise((resolve) => {
        if (lines.includes(word)) return resolve();
        waits.push({ word, resolve });
      }),
    go: () => {
      for (const socket of sockets) socket.write('go\n');
    },
    close: () => {
      for (const socket of sockets) socket.destroy();
      server.close();
    },
  };
}

/** The runner over `repo`, in a process group of its own. */
function startRunner(
  repo: string,
  env: Readonly<Record<string, string>>,
): {
  child: ChildProcess;
  ended: Promise<number>;
  exited: Promise<number>;
  output: () => string;
} {
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
  // The runner's own end, whatever still holds its output pipes.
  const exited = new Promise<number>((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
  });
  return { child, ended, exited, output: () => output };
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
  it('a cleanup running at the first interrupt finishes before the run ends', async (t) => {
    const file = 'src/__tests__/cleanup.test.ts';
    const repo = built('cleanup', {
      [file]: [
        ...PRELUDE,
        "import { after, it } from 'node:test';",
        "after(async () => { record('cleanup started'); await untilGo(); record('cleanup finished'); });",
        "it('runs', () => record('case'));",
        '',
      ].join('\n'),
    });
    const record = path.join(scratch.dir, 'cleanup.record');
    const said = await signals();
    t.after(said.close);
    const run = startRunner(repo, {
      RECORD: record,
      SIGNAL_PORT: String(said.port),
    });
    await said.seen('cleanup started');
    interrupt(run.child);
    // The runner said it waits; the cleanup then goes on to its end.
    await new Promise<void>((resolve) => {
      const check = () => run.output().includes('interrupted');
      if (check()) return resolve();
      run.child.stderr?.on('data', () => {
        if (check()) resolve();
      });
    });
    said.go();
    const code = await run.ended;
    assert.deepEqual(recorded(record), [
      'case',
      'cleanup started',
      'cleanup finished',
    ]);
    // An interrupted run fails.
    assert.equal(code, 1, run.output());
  });

  it("a second interrupt ends every running file's process tree", async (t) => {
    // The cleanup holds a connection to this test and echoes what it is
    // sent. Once the run has ended, a line sent to it is echoed only by a
    // process still running; a killed one (SIGKILL is delivered before it
    // runs again) closes the connection instead.
    const server = net.createServer();
    const held = new Promise<net.Socket>((resolve) => {
      server.once('connection', resolve);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert.ok(typeof address === 'object' && address !== null);
    const file = 'src/__tests__/stuck.test.ts';
    const repo = built('stuck', {
      [file]: [
        ...PRELUDE,
        "import { after, it } from 'node:test';",
        'after(async () => {',
        "  const socket = connect(Number(process.env.HOLD_PORT), '127.0.0.1');",
        "  socket.on('data', (data) => socket.write(data));",
        "  await new Promise((resolve) => socket.once('connect', resolve));",
        '  record(`pid ${process.pid}`);',
        "  record('cleanup started');",
        '  await untilGo();',
        "  record('cleanup finished');",
        '});',
        "it('runs', () => record('case'));",
        '',
      ].join('\n'),
    });
    const record = path.join(scratch.dir, 'stuck.record');
    // Never told to go: the cleanup waits until it is stopped.
    const said = await signals();
    t.after(said.close);
    const run = startRunner(repo, {
      RECORD: record,
      SIGNAL_PORT: String(said.port),
      HOLD_PORT: String(address.port),
    });
    const socket = await held;
    socket.on('error', () => undefined);
    const closed = new Promise<string>((resolve) => {
      socket.once('close', () => resolve('closed'));
    });
    await said.seen('cleanup started');
    interrupt(run.child);
    await new Promise<void>((resolve) => {
      const check = () => run.output().includes('interrupted');
      if (check()) return resolve();
      run.child.stderr?.on('data', () => {
        if (check()) resolve();
      });
    });
    interrupt(run.child);
    // The runner's exit, not its pipes' close: a cleanup that survived would
    // hold them open.
    const code = await run.exited;
    const echoed = new Promise<string>((resolve) => {
      socket.once('data', () => resolve('echoed: the cleanup still runs'));
    });
    if (!socket.destroyed) socket.write('alive?');
    const answer = await Promise.race([closed, echoed]);
    server.close();
    if (answer !== 'closed') {
      // A survivor would outlive the case: end it before failing.
      const pid = Number(
        (recorded(record).find((line) => line.startsWith('pid ')) ?? '').slice(
          4,
        ),
      );
      if (pid > 0) process.kill(pid, 'SIGKILL');
    }
    assert.equal(answer, 'closed');
    assert.equal(code, 1);
    assert.equal(recorded(record).includes('cleanup finished'), false);
  });

  it('a live suite interrupted during its first case finishes it and its cleanup, skips the rest, and no further file starts', async (t) => {
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
        "  it('one', async () => { record('one started'); await untilGo(); record('one finished'); });",
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
    const said = await signals();
    t.after(said.close);
    const run = startRunner(repo, {
      RECORD: record,
      SIGNAL_PORT: String(said.port),
      LIVE_HELPERS: OWN_LIVE,
    });
    await said.seen('one started');
    interrupt(run.child);
    await new Promise<void>((resolve) => {
      const check = () => run.output().includes('interrupted');
      if (check()) return resolve();
      run.child.stderr?.on('data', () => {
        if (check()) resolve();
      });
    });
    said.go();
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
