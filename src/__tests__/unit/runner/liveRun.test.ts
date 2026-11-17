/**
 * The runner's live run (D27, step 11): a live suite runs only under a live
 * npm script; under one the runner calls the live setup before `node --test`
 * and the teardown after it, whatever the run's outcome, and the run fails
 * when the teardown does; every file's process closes the connections it
 * tracked, after the file's own hooks. Each case runs the runner over a
 * fixture repository whose files sit where the live suites do. The setup
 * reads an empty test config, so nothing logs on and nothing is sent.
 *
 * Beside them, the hook guard (P6): no Jest file calls a function that
 * registers a tracked connection without closing what it tracked.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';
import * as ts from 'typescript';
import {
  environment,
  fixtureRepo,
  JEST,
  REPO,
  recorded,
  runNode,
  runTool,
  temporaryDir,
  writeAt,
} from './toolRuns';

const scratch = temporaryDir('live-run-');
after(() => scratch.remove());

const LIVE = 'src/__tests__/integration/x.test.ts';
const OWN_BUILD = path.join(REPO, '.test-build', 'tree');

/** An empty test config: the setup finds no destination and returns. */
let emptyConfig = '';
before(() => {
  emptyConfig = writeAt(scratch.dir, 'empty-config.yaml', '{}\n');
});

/** A live file of the fixture: records its run directory, then does `body`. */
function liveSource(body: readonly string[]): string {
  return [
    "import { appendFileSync, writeFileSync } from 'node:fs';",
    "import * as path from 'node:path';",
    "import { describe, it } from 'node:test';",
    'void writeFileSync;',
    'void path;',
    "const record = (word: string) => appendFileSync(process.env.RECORD ?? '', `${word}\\n`);",
    "describe('a live file', () => {",
    "  it('runs', () => {",
    "    record(process.env.MCP_ABAP_ADT_COVERAGE_RUN ?? 'no run directory');",
    ...body.map((line) => `    ${line}`),
    '  });',
    '});',
    '',
  ].join('\n');
}

/** The fixture repository, built. */
function liveRepo(name: string, body: readonly string[]): string {
  const repo = fixtureRepo(path.join(scratch.dir, name), [LIVE], {
    [LIVE]: liveSource(body),
  });
  const built = runTool('build-node-tests.mjs', ['--repo', repo]);
  assert.equal(built.status, 0, built.stderr);
  return repo;
}

/** The runner over `repo`'s live file, under the npm script `event`. */
function runLive(repo: string, record: string, event?: string) {
  return runTool(
    'run-tests.mjs',
    ['--repo', repo, '--concurrency', '1', '--root', path.join(repo, 'src')],
    environment(
      {
        RECORD: record,
        MCP_TEST_CONFIG: emptyConfig,
        ...(event === undefined ? {} : { npm_lifecycle_event: event }),
      },
      ['npm_lifecycle_event', 'MCP_ABAP_ADT_COVERAGE_RUN'],
    ),
  );
}

describe('the live run', () => {
  it('a live suite runs only under a live npm script', () => {
    const repo = liveRepo('not-live', []);
    const record = path.join(scratch.dir, 'not-live.record');
    const refused = runLive(repo, record, 'test');
    assert.equal(refused.status, 1);
    assert.ok(
      refused.stderr.includes('a live suite runs only under a live npm script'),
      refused.stderr,
    );
    assert.deepEqual(recorded(record), []);
    // With no root and no named file, the unit run leaves the live suites out.
    const unit = runTool(
      'run-tests.mjs',
      ['--repo', repo, '--concurrency', '1'],
      environment({ RECORD: record }, ['npm_lifecycle_event']),
    );
    assert.equal(unit.status, 1);
    assert.ok(unit.stderr.includes('the node:test list is empty'), unit.stderr);
    assert.deepEqual(recorded(record), []);
  });

  it('teardown runs when the run failed', () => {
    const repo = liveRepo('fails', ["throw new Error('the case failed');"]);
    const record = path.join(scratch.dir, 'fails.record');
    const run = runLive(repo, record, 'test:high');
    assert.equal(run.status, 1, run.stdout + run.stderr);
    const [dir] = recorded(record);
    assert.ok(dir !== undefined && dir !== 'no run directory', run.stderr);
    // The setup made the run's directory and the files saw it; the teardown
    // removed it, after the failed run.
    assert.equal(fs.existsSync(dir), false);
  });

  it('teardown failing fails the run', () => {
    // The case passes and latches the run's refusal marker: the teardown
    // refuses the run.
    const repo = liveRepo('marker', [
      "writeFileSync(path.join(process.env.MCP_ABAP_ADT_COVERAGE_RUN ?? '', 'credential-refused'), 'now');",
    ]);
    const record = path.join(scratch.dir, 'marker.record');
    const run = runLive(repo, record, 'test:high');
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.ok(
      run.stderr.includes('the live teardown failed') &&
        run.stderr.includes('a credential was refused in this run'),
      run.stderr,
    );
  });

  it('a passing live run with nothing to report passes', () => {
    const repo = liveRepo('passes', []);
    const record = path.join(scratch.dir, 'passes.record');
    const run = runLive(repo, record, 'test:high');
    assert.equal(run.status, 0, run.stdout + run.stderr);
  });
});

describe('the per-file close', () => {
  it("a tracked connection is closed after the file's hooks", () => {
    const openConnections = path.join(
      OWN_BUILD,
      'src',
      '__tests__',
      'integration',
      'helpers',
      'openConnections.js',
    );
    const repo = fixtureRepo(path.join(scratch.dir, 'close'), [LIVE], {
      [LIVE]: [
        "import { appendFileSync } from 'node:fs';",
        "import { after, describe, it } from 'node:test';",
        "const record = (word: string) => appendFileSync(process.env.RECORD ?? '', `${word}\\n`);",
        // This repository's own module, the one the runner's preload closes.
        'const helpers: unknown = require(process.env.OPEN_CONNECTIONS ?? "");',
        "describe('a file that opens a tracked connection', () => {",
        '  after(() => record("the file\'s own hook"));',
        "  it('opens one', () => {",
        "    const track: unknown = typeof helpers === 'object' && helpers !== null ? Reflect.get(helpers, 'trackConnection') : undefined;",
        "    if (typeof track !== 'function') throw new Error('no trackConnection');",
        "    Reflect.apply(track, undefined, [{ disconnect: async () => record('closed') }]);",
        '  });',
        '});',
        '',
      ].join('\n'),
    });
    const built = runTool('build-node-tests.mjs', ['--repo', repo]);
    assert.equal(built.status, 0, built.stderr);
    const record = path.join(scratch.dir, 'close.record');
    const run = runTool(
      'run-tests.mjs',
      ['--repo', repo, '--concurrency', '1', '--root', path.join(repo, 'src')],
      environment(
        {
          RECORD: record,
          MCP_TEST_CONFIG: emptyConfig,
          OPEN_CONNECTIONS: openConnections,
          npm_lifecycle_event: 'test:high',
        },
        ['MCP_ABAP_ADT_COVERAGE_RUN'],
      ),
    );
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.deepEqual(recorded(record), ["the file's own hook", 'closed']);
  });

  it('no live file registers a root-level after: the close runs after every hook of the file', () => {
    // The preload's root `after` runs before any root-level `after` the file
    // registers itself (node:test runs root hooks in the order they were
    // registered; measured on Node 22, 24, 26), so none may exist.
    const found: string[] = [];
    for (const root of ['src/__tests__/integration', 'src/__tests__/admin']) {
      for (const entry of fs.readdirSync(path.join(REPO, root), {
        withFileTypes: true,
        recursive: true,
      })) {
        if (!entry.isFile() || !entry.name.endsWith('.test.ts')) continue;
        const file = path.join(entry.parentPath, entry.name);
        const source = ts.createSourceFile(
          file,
          fs.readFileSync(file, 'utf8'),
          ts.ScriptTarget.Latest,
        );
        for (const statement of source.statements) {
          if (
            ts.isExpressionStatement(statement) &&
            ts.isCallExpression(statement.expression) &&
            ts.isIdentifier(statement.expression.expression) &&
            ['after', 'afterAll'].includes(statement.expression.expression.text)
          ) {
            found.push(path.relative(REPO, file));
          }
        }
      }
    }
    assert.deepEqual(found, []);
  });
});

/** The functions whose call registers a tracked connection, read from the helpers. */
const REGISTERING = [
  'trackConnection',
  'createTestConnectionAndSession',
  'testConnectionLogOn',
];

/**
 * The Jest files (`jest --listTests --json`, a child process) that call a
 * registering function and never `closeTrackedConnections`: calls, not
 * imports (P6).
 */
function filesLeavingConnections(): string[] {
  const run = runNode(JEST, ['--listTests', '--json']);
  assert.equal(run.status, 0, run.stderr);
  const listed: unknown = JSON.parse(run.stdout);
  assert.ok(Array.isArray(listed));
  const leaving: string[] = [];
  for (const file of listed) {
    if (typeof file !== 'string') continue;
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
    );
    const called = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const name = ts.isIdentifier(callee)
          ? callee.text
          : ts.isPropertyAccessExpression(callee) &&
              ts.isIdentifier(callee.name)
            ? callee.name.text
            : undefined;
        if (name !== undefined) called.add(name);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (
      REGISTERING.some((name) => called.has(name)) &&
      !called.has('closeTrackedConnections')
    ) {
      leaving.push(path.relative(REPO, file).split(path.sep).join('/'));
    }
  }
  return leaving;
}

describe('the hook guard', () => {
  it('no Jest file leaves a tracked connection to a hook', () => {
    assert.deepEqual(filesLeavingConnections(), []);
  });
});
