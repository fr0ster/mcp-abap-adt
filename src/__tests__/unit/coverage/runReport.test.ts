/**
 * The run report and its check (plan C2 Step 2), with no SAP: fixture files
 * run through `node --test` with the integration scripts' reporters — the
 * `spec` reporter and the compiled ledger reporter
 * (`coverageReport/ledgerReporter.ts`) — on the stub live runner, and the
 * teardown's check reads what the reporter wrote from node:test's completed
 * results (D27, step 11).
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';
import type { TestEvent } from 'node:test/reporters';
import { pathToFileURL } from 'node:url';
import { adtStandIn } from '../../helpers/adtStandIn';
import { repositoryRoot } from '../../helpers/repoRoot';

import ledgerReporter = require('../../integration/coverageReport/ledgerReporter');

import {
  appendCall,
  namePath,
  type OutcomeEntry,
  readCallLog,
  readFilesRan,
  readOutcomes,
  testKey,
} from '../../integration/coverageReport/reportFormat';
import { setUpLiveRun } from '../../integration/globalSetup';
import { assertEquals } from '../../integration/helpers/liveAssert';
import {
  checkRunReport,
  type LiveFiles,
  liveFilesOf,
} from '../../integration/helpers/runReport';
import { environment } from '../runner/toolRuns';

const REPO = repositoryRoot(__dirname);
const BUILD = path.join(REPO, '.test-build', 'tree');
const FIXTURES = 'src/__tests__/unit/coverage/__fixtures__/report';
const fixture = (name: string): string => `${FIXTURES}/${name}.fixture.ts`;
const compiled = (name: string): string =>
  path.join(BUILD, ...FIXTURES.split('/'), `${name}.fixture.js`);
const preload = (...parts: string[]): string =>
  path.join(BUILD, 'src', '__tests__', ...parts);

/** The fixtures the full run runs. */
const ALL = [
  'cleanupFails',
  'crash',
  'failsAfterCall',
  'nested',
  'passes',
  'planMissed',
  'skipAfterCall',
  'skipped',
  'todoAfterCall',
];

/**
 * `names` run through `node --test` with the scripts' reporters, the run's
 * directory `runDir`, one file at a time: what `node --test` printed.
 */
function runFixtures(names: readonly string[], runDir: string): string {
  const run = spawnSync(
    process.execPath,
    [
      '--require',
      preload('helpers', 'resolvePreload.js'),
      '--require',
      preload('integration', 'helpers', 'closeConnectionsPreload.js'),
      '--test',
      '--test-concurrency=1',
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      // A file URL: node loads a reporter as a module, and an absolute
      // Windows path reads as a URL whose scheme is its drive letter.
      `--test-reporter=${pathToFileURL(preload('integration', 'coverageReport', 'ledgerReporter.js')).href}`,
      '--test-reporter-destination=stdout',
      ...names.map(compiled),
    ],
    {
      cwd: REPO,
      encoding: 'utf8',
      env: environment({ MCP_ABAP_ADT_COVERAGE_RUN: runDir }),
    },
  );
  if (run.error !== undefined) throw run.error;
  return run.stdout + run.stderr;
}

/** The run directory `body` reads, with `MCP_ABAP_ADT_COVERAGE_RUN` set to it. */
function inRun<T>(runDir: string, body: () => T): T {
  const saved = process.env.MCP_ABAP_ADT_COVERAGE_RUN;
  process.env.MCP_ABAP_ADT_COVERAGE_RUN = runDir;
  try {
    return body();
  } finally {
    if (saved === undefined) delete process.env.MCP_ABAP_ADT_COVERAGE_RUN;
    else process.env.MCP_ABAP_ADT_COVERAGE_RUN = saved;
  }
}

const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-report-test-'));
let outcomes: OutcomeEntry[] = [];
let ran: string[] = [];
let printed = '';

before(() => {
  printed = runFixtures(ALL, runDir);
  outcomes = inRun(runDir, readOutcomes);
  ran = inRun(runDir, readFilesRan);
});

after(() => {
  fs.rmSync(runDir, { recursive: true, force: true });
});

/** A ledger whose keys run on premise in the files named. */
const ledgerOf = (rows: Record<string, string>): LiveFiles =>
  liveFilesOf(
    Object.fromEntries(
      Object.entries(rows).map(([key, file]) => [
        key,
        { unit: 'unit.test.ts', live: { onprem: file } },
      ]),
    ),
  );

const check = (
  ledger: LiveFiles,
  scope: 'full' | 'family',
  files = ran,
): string[] =>
  checkRunReport({
    ledger,
    outcomes,
    system: 'onprem',
    scope: scope === 'full' ? { kind: 'full' } : { kind: 'family', files },
  });

/** Each key's outcomes, sorted. */
const outcomesOf = (entries: readonly OutcomeEntry[]): string[] =>
  entries.map((o) => `${o.key} ${o.outcome}`).sort();

describe('the run report', () => {
  it("every key gets its test's completed outcome, read from node:test", () => {
    assertEquals(
      outcomesOf(outcomes),
      [
        'GetClass failed',
        'GetDomain failed',
        'GetFunctionGroup passed',
        'GetInterface failed',
        'GetProgram passed',
        'GetTable skipped',
        'GetView skipped',
      ],
      printed,
    );
  });

  it('every file that ran is recorded by its repository source path', () => {
    assertEquals([...ran].sort(), ALL.map(fixture));
  });

  it('the join key: a case two describes deep is joined by the same name path', () => {
    const deep = inRun(runDir, readCallLog).find(
      (entry) => entry.key === 'GetFunctionGroup',
    );
    assert.ok(deep !== undefined);
    assert.equal(deep.file, fixture('nested'));
    // The reporter's rebuilt path (`namePath`) is the string `t.fullName`
    // gave `liveCall` (the fixture asserts the latter).
    assert.equal(
      deep.test,
      namePath(['nested', 'cases', 'one', 'two', 'deep case']),
    );
    assert.equal(
      testKey(deep.file, deep.test),
      testKey(
        fixture('nested'),
        namePath(['nested', 'cases', 'one', 'two', 'deep case']),
      ),
    );
  });

  it('a case skipped before any call records no call, and its key is not run', () => {
    assertEquals(
      check(ledgerOf({ GetDataElement: fixture('skipped') }), 'full'),
      ['GetDataElement on onprem: not run'],
    );
  });

  it('a file whose process ends mid-case leaves its key not run', () => {
    assertEquals(check(ledgerOf({ GetPackage: fixture('crash') }), 'full'), [
      'GetPackage on onprem: not run',
    ]);
  });

  it('a case that skips itself after its call, and a todo case, fail the required-key check', () => {
    assertEquals(
      check(
        ledgerOf({
          GetView: fixture('skipAfterCall'),
          GetTable: fixture('todoAfterCall'),
        }),
        'full',
      ),
      ['GetView on onprem: skipped', 'GetTable on onprem: skipped'],
    );
  });

  it('the full run passes when every required key passed', () => {
    assertEquals(
      check(ledgerOf({ GetProgram: fixture('passes') }), 'full'),
      [],
    );
  });

  it('a key required on the other system only is not required here', () => {
    const ledger = liveFilesOf({
      GetProgram: { unit: 'u', live: { onprem: fixture('passes') } },
      GetTable: { unit: 'u', live: { cloud: fixture('passes') } },
    });
    assertEquals(check(ledger, 'full'), []);
  });

  it('a family run checks only the keys of its own files', () => {
    const ledger = ledgerOf({
      GetProgram: fixture('passes'),
      GetStructure: 'src/__tests__/integration/notRun.test.ts',
    });
    assertEquals(check(ledger, 'family'), []);
    assertEquals(check(ledger, 'full'), ['GetStructure on onprem: not run']);
  });

  it('a key whose test failed after the call is reported failed', () => {
    assertEquals(
      check(ledgerOf({ GetClass: fixture('failsAfterCall') }), 'full'),
      ['GetClass on onprem: failed'],
    );
  });

  it('a key whose afterEach cleanup fails is reported failed', () => {
    assertEquals(
      check(ledgerOf({ GetInterface: fixture('cleanupFails') }), 'full'),
      ['GetInterface on onprem: failed'],
    );
  });

  it('a key whose test misses its planned assertion count is reported failed', () => {
    assertEquals(
      check(ledgerOf({ GetDomain: fixture('planMissed') }), 'full'),
      ['GetDomain on onprem: failed'],
    );
  });
});

describe('a family run', () => {
  const familyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-run-test-'));
  after(() => fs.rmSync(familyDir, { recursive: true, force: true }));

  it('records exactly its two files by their source paths, and requires exactly their keys', () => {
    runFixtures(['passes', 'failsAfterCall'], familyDir);
    const files = inRun(familyDir, readFilesRan).sort();
    assertEquals(files, [fixture('failsAfterCall'), fixture('passes')]);
    const ledger = ledgerOf({
      GetProgram: fixture('passes'),
      GetClass: fixture('failsAfterCall'),
      GetDomain: fixture('planMissed'),
    });
    assertEquals(
      checkRunReport({
        ledger,
        outcomes: inRun(familyDir, readOutcomes),
        system: 'onprem',
        scope: { kind: 'family', files },
      }),
      ['GetClass on onprem: failed'],
    );
  });
});

describe('the ledger reporter', () => {
  const eventDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-events-'));
  after(() => fs.rmSync(eventDir, { recursive: true, force: true }));

  /** The reporter run over `events`, to its end. */
  async function report(events: TestEvent[]): Promise<void> {
    async function* source(): AsyncGenerator<TestEvent, void> {
      yield* events;
    }
    for await (const _ of ledgerReporter(source())) {
      // It writes nothing of its own.
    }
  }

  it('a case cancelled after its call is failed', async () => {
    const file = path.join(
      BUILD,
      'src',
      '__tests__',
      'integration',
      'x.test.js',
    );
    const start = (name: string, nesting: number): TestEvent => ({
      type: 'test:start',
      data: { name, nesting, file },
    });
    // node:test's error for a test its parent cancelled: it wraps its cause.
    const cancelled = Object.assign(
      new Error('cancelled', { cause: new Error('the parent ended') }),
      {
        cause: new Error('the parent ended'),
        failureType: 'cancelledByParent',
      },
    );
    const saved = process.env.MCP_ABAP_ADT_COVERAGE_RUN;
    process.env.MCP_ABAP_ADT_COVERAGE_RUN = eventDir;
    try {
      appendCall({
        file: 'src/__tests__/integration/x.test.ts',
        test: namePath(['suite', 'cases', 'cancelled case']),
        key: 'GetProgram',
        system: 'onprem',
      });
      await report([
        start('suite', 0),
        start('cases', 1),
        start('cancelled case', 2),
        {
          type: 'test:fail',
          data: {
            name: 'cancelled case',
            nesting: 2,
            file,
            testNumber: 1,
            details: {
              duration_ms: 0,
              error: cancelled,
            },
          },
        },
      ]);
      assertEquals(outcomesOf(readOutcomes()), ['GetProgram failed']);
    } finally {
      if (saved === undefined) delete process.env.MCP_ABAP_ADT_COVERAGE_RUN;
      else process.env.MCP_ABAP_ADT_COVERAGE_RUN = saved;
    }
  });
});

describe('the family selection', () => {
  const event = process.env.npm_lifecycle_event;
  const configFile = process.env.MCP_TEST_CONFIG;

  afterEach(() => {
    if (event === undefined) delete process.env.npm_lifecycle_event;
    else process.env.npm_lifecycle_event = event;
    if (configFile === undefined) delete process.env.MCP_TEST_CONFIG;
    else process.env.MCP_TEST_CONFIG = configFile;
  });

  it('the live setup refuses a selection that is not an exact integration test file', async () => {
    // A config whose destination is the stand-in: anything the setup sent
    // before refusing the selection would arrive there.
    const stand = await adtStandIn();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-selection-'));
    try {
      fs.mkdirSync(path.join(dir, 'sessions'));
      fs.writeFileSync(
        path.join(dir, 'sessions', 'STAND.env'),
        `SAP_URL=${stand.url}\nSAP_AUTH_TYPE=basic\n`,
      );
      const configPath = path.join(dir, 'test-config.yaml');
      fs.writeFileSync(
        configPath,
        [
          'auth_broker:',
          `  paths: { service_keys_dir: ${JSON.stringify(dir)} }`,
          'environment:',
          '  env: STAND.env',
          '  system_type: onprem',
          '  expected_realm: STAND',
          '',
        ].join('\n'),
      );
      process.env.MCP_TEST_CONFIG = configPath;
      process.env.npm_lifecycle_event = 'test:coverage-family';
      const refused = [
        [],
        ['src/__tests__/integration/high'],
        ['ClassHighHandlers'],
        ['src/__tests__/integration/helpers/live.ts'],
        ['src/__tests__/integration/high/class/NoSuchHandlers.test.ts'],
        ['src/__tests__/integration/high/class/ClassHighHandlers.*'],
        ['./src/__tests__/integration/high/class/ClassHighHandlers.test.ts'],
        [
          'src/__tests__/integration/high/class/ClassHighHandlers.test.ts',
          'src/__tests__/integration/high/class',
        ],
      ];
      for (const patterns of refused) {
        await assert.rejects(
          setUpLiveRun({ rootDir: REPO, named: patterns }),
          (error: unknown) =>
            error instanceof Error &&
            error.message.includes('test:coverage-family'),
        );
      }
      assertEquals(stand.requests, []);
    } finally {
      await stand.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an exact integration test file is accepted', async () => {
    process.env.npm_lifecycle_event = 'test:coverage-family';
    // A config naming no destination: past the selection, the setup
    // returns at once.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-selection-'));
    try {
      const empty = path.join(dir, 'empty.yaml');
      fs.writeFileSync(empty, '{}\n');
      process.env.MCP_TEST_CONFIG = empty;
      assert.equal(
        await setUpLiveRun({
          rootDir: REPO,
          named: [
            'src/__tests__/integration/high/class/ClassHighHandlers.test.ts',
          ],
        }),
        undefined,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
