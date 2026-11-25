/**
 * The parts of the runner's per-file bound (`tools/file-bound.mjs`), each
 * run in a node process of its own that imports the module and prints what
 * it answered as JSON: the process table read and its descendants, which
 * files are live by their place on disk, how a file's process is watched
 * against its bound (a file that has exited is not ended, one that exits
 * `0` while being ended has passed, a tree that cannot be ended settles at
 * once, the timer holds no process alive), and a write that settles only
 * once flushed. Each child is given 20 s by `spawnSync`, so a part that
 * hangs fails its case instead of hanging the file.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { environment, REPO, temporaryDir } from './toolRuns';

const MODULE = pathToFileURL(path.join(REPO, 'tools', 'file-bound.mjs')).href;

const scratch = temporaryDir('file-bound-');
after(() => scratch.remove());

/**
 * Runs `body` (module code, the bound's module imported as `bound` and an
 * `EventEmitter` as `EventEmitter`) in a node process of its own; answers
 * what it printed, parsed, and how long it took.
 */
function partRun(body: string): { printed: unknown; took: number } {
  const started = Date.now();
  const run = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      [
        `import * as bound from ${JSON.stringify(MODULE)};`,
        "import { EventEmitter } from 'node:events';",
        'const print = (value) => process.stdout.write(JSON.stringify(value));',
        body,
      ].join('\n'),
    ],
    {
      encoding: 'utf8',
      env: environment(),
      timeout: 20_000,
      killSignal: 'SIGKILL',
    },
  );
  const took = Date.now() - started;
  assert.equal(run.status, 0, `${run.signal ?? ''} ${run.stderr}`);
  return { printed: JSON.parse(run.stdout), took };
}

describe('the process table', () => {
  it('reads pid and parent pairs and finds every descendant, at any depth', () => {
    const { printed } = partRun(
      [
        "const pairs = bound.parseProcessTable(' 13 12\\n 12  11\\n  1     0\\n\\t11\\t10\\n 10 1\\n 20 1\\n PID PPID\\n 7\\n');",
        'print({ pairs, of10: bound.descendantsOf(10, pairs), of20: bound.descendantsOf(20, pairs) });',
      ].join('\n'),
    );
    assert.deepEqual(printed, {
      // A child listed before its parent: found all the same.
      pairs: [
        [13, 12],
        [12, 11],
        [1, 0],
        [11, 10],
        [10, 1],
        [20, 1],
      ],
      of10: [11, 12, 13],
      of20: [],
    });
  });
});

describe('a live file, by its place on disk', () => {
  it('ignores case on Windows, and only there', () => {
    const mixed = path.join(
      'repo',
      'SRC',
      '__TESTS__',
      'Integration',
      'a.test.js',
    );
    const { printed } = partRun(
      [
        `const file = ${JSON.stringify(mixed)};`,
        "const roots = ['src/__tests__/integration', 'src/__tests__/admin'];",
        "const source = 'SRC/__Tests__/ADMIN/b.test.ts';",
        'print({',
        "  file: [bound.isLiveFile(file, 'win32'), bound.isLiveFile(file, 'linux'), bound.isLiveFile(file)],",
        "  source: [bound.isLiveSource(source, roots, 'win32'), bound.isLiveSource(source, roots, 'linux'), bound.isLiveSource(source, roots)],",
        '});',
      ].join('\n'),
    );
    const native = process.platform === 'win32';
    assert.deepEqual(printed, {
      file: [true, false, native],
      source: [true, false, native],
    });
  });

  it('is any file under __tests__/integration or __tests__/admin, compiled or not, through any link', () => {
    const real = path.join(scratch.dir, 'real', 'src', '__tests__');
    fs.mkdirSync(path.join(real, 'integration'), { recursive: true });
    fs.writeFileSync(path.join(real, 'integration', 'x.test.js'), '');
    const link = path.join(scratch.dir, 'link');
    fs.symlinkSync(
      path.join(real, 'integration'),
      link,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const files = [
      path.join('repo', 'src', '__tests__', 'integration', 'a.test.ts'),
      path.join(
        'repo',
        '.test-build',
        'tree',
        'src',
        '__tests__',
        'admin',
        'b.test.js',
      ),
      path.join(link, 'x.test.js'),
      path.join('repo', 'src', '__tests__', 'unit', 'integration.test.js'),
      path.join('repo', 'src', 'integration', '__tests__', 'c.test.js'),
    ];
    const { printed } = partRun(
      `print(${JSON.stringify(files)}.map((file) => bound.isLiveFile(file)));`,
    );
    assert.deepEqual(printed, [true, true, true, false, false]);
  });
});

/** A fake child: an `EventEmitter` with a pid. */
const FAKE_CHILD =
  'const child = Object.assign(new EventEmitter(), { pid: 4242 });';

describe('watching a file against its bound', () => {
  it('does not end a file that has exited when the bound expires', () => {
    const { printed } = partRun(
      [
        FAKE_CHILD,
        'const ends = [];',
        'const watched = bound.watchFile(child, 0.05, () => { ends.push(1); return { ok: true }; });',
        "child.emit('exit', 0, null);",
        'await new Promise((resolve) => setTimeout(resolve, 300));',
        "child.emit('close', 0, null);",
        'print({ result: await watched, ends: ends.length });',
      ].join('\n'),
    );
    assert.deepEqual(printed, {
      result: { outcome: 'ended', code: 0 },
      ends: 0,
    });
  });

  it('reads a file that exits 0 while being ended as passed', () => {
    const { printed } = partRun(
      [
        FAKE_CHILD,
        "// A real child holds the process alive; the bound's timer does not.",
        'const keep = setInterval(() => {}, 1000);',
        'const watched = bound.watchFile(child, 0.05, (target) => {',
        "  target.emit('exit', 0, null);",
        "  queueMicrotask(() => target.emit('close', 0, null));",
        '  return { ok: true };',
        '});',
        'print(await watched);',
        'clearInterval(keep);',
      ].join('\n'),
    );
    assert.deepEqual(printed, { outcome: 'ended', code: 0 });
  });

  it('reports a file ended by the bound only once its close is seen', () => {
    const { printed } = partRun(
      [
        FAKE_CHILD,
        'let settled = false;',
        'const watched = bound.watchFile(child, 0.05, () => ({ ok: true }));',
        'watched.then(() => { settled = true; });',
        'await new Promise((resolve) => setTimeout(resolve, 300));',
        'const before = settled;',
        "child.emit('exit', null, 'SIGKILL');",
        "child.emit('close', null, 'SIGKILL');",
        'print({ before, result: await watched });',
      ].join('\n'),
    );
    assert.deepEqual(printed, {
      before: false,
      result: { outcome: 'stopped' },
    });
  });

  it('settles at once when the tree cannot be ended, never waiting on the file', () => {
    const { printed } = partRun(
      [
        FAKE_CHILD,
        "const watched = bound.watchFile(child, 0.05, () => ({ ok: false, reason: 'taskkill exited 1' }));",
        'const ticks = setInterval(() => {}, 1000);',
        'print(await watched);',
        'clearInterval(ticks);',
      ].join('\n'),
    );
    assert.deepEqual(printed, {
      outcome: 'unkillable',
      reason: 'taskkill exited 1',
    });
  });

  it('holds no process alive by its timer', () => {
    // The fake child never closes; only the bound's timer is left. Held
    // alive, the process would wait the whole 600 s and be killed at 20 s.
    const { printed, took } = partRun(
      [
        FAKE_CHILD,
        'bound.watchFile(child, 600, () => ({ ok: true }));',
        "print('left');",
      ].join('\n'),
    );
    assert.equal(printed, 'left');
    assert.ok(took < 15_000, `took ${took} ms`);
  });
});

describe('a flushed write', () => {
  it('settles only once the stream has flushed the text', () => {
    const { printed } = partRun(
      [
        'const written = [];',
        'let flush;',
        'const stream = { write: (text, done) => { written.push(text); flush = done; return false; } };',
        'let settled = false;',
        "const writing = bound.writeFlushed(stream, 'summary\\n').then(() => { settled = true; });",
        'await new Promise((resolve) => setTimeout(resolve, 100));',
        'const before = settled;',
        'flush();',
        'await writing;',
        'print({ written, before, after: settled });',
      ].join('\n'),
    );
    assert.deepEqual(printed, {
      written: ['summary\n'],
      before: false,
      after: true,
    });
  });
});
