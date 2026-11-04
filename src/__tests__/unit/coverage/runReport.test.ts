/**
 * The run report and its check (plan C2 Step 2), with no SAP: fixture test
 * files run through Jest's `runCLI` with the exact reporter command of the
 * integration scripts — Jest's default reporter and the compiled
 * `build/test-reporter/coverageReporter.js` (`npm run build:test-reporter`,
 * which `npm test`'s `pretest` runs) — and `globalTeardown`'s check reads
 * what the reporter wrote from Jest's completed results.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCLI } from 'jest';
import { adtStandIn } from '../../helpers/adtStandIn';
import {
  type OutcomeEntry,
  readFilesRan,
  readOutcomes,
} from '../../integration/coverageReport/reportFormat';
import globalSetup from '../../integration/globalSetup';
import {
  checkRunReport,
  type LiveFiles,
  liveFilesOf,
} from '../../integration/helpers/runReport';

jest.setTimeout(120_000);

const REPO = path.join(__dirname, '..', '..', '..', '..');
const REPORTER = path.join(
  REPO,
  'build',
  'test-reporter',
  'coverageReporter.js',
);
const FIXTURES = 'src/__tests__/unit/coverage/__fixtures__/report';
const fixture = (name: string): string => `${FIXTURES}/${name}.fixture.ts`;

let runDir: string;
let outcomes: OutcomeEntry[];
let ran: string[];
let statuses: Array<{ fullName: string; status: string }>;

beforeAll(async () => {
  runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-report-test-'));
  process.env.MCP_ABAP_ADT_COVERAGE_RUN = runDir;
  const config: unknown = JSON.parse(
    fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'),
  );
  const rootJest: unknown =
    typeof config === 'object' && config !== null
      ? Reflect.get(config, 'jest')
      : undefined;
  const { results } = await runCLI(
    {
      _: [],
      $0: 'jest',
      silent: true,
      watchman: false,
      // In a worker of its own, never in this process: a run in band here
      // would tear down the module scope of this very test.
      maxWorkers: 1,
      workerIdleMemoryLimit: '1GB',
      config: JSON.stringify({
        ...(typeof rootJest === 'object' && rootJest !== null ? rootJest : {}),
        rootDir: REPO,
        roots: [path.join(REPO, FIXTURES)],
        testMatch: ['**/*.fixture.ts'],
        testPathIgnorePatterns: [],
        globalSetup: undefined,
        globalTeardown: undefined,
        // The integration scripts' reporters, exactly.
        reporters: ['default', REPORTER],
        globals: { COVERAGE_RUN: runDir },
      }),
    },
    [REPO],
  );
  statuses = results.testResults.flatMap((file) =>
    file.testResults.map((test) => ({
      fullName: test.fullName,
      status: test.status,
    })),
  );
  outcomes = readOutcomes();
  ran = readFilesRan();
});

afterAll(() => {
  delete process.env.MCP_ABAP_ADT_COVERAGE_RUN;
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

const check = (ledger: LiveFiles, scope: 'full' | 'family'): string[] =>
  checkRunReport({
    ledger,
    outcomes,
    system: 'onprem',
    scope: scope === 'full' ? { kind: 'full' } : { kind: 'family', files: ran },
  });

describe('the run report', () => {
  it('the fixtures ran as Jest completed them', () => {
    expect(
      statuses.sort((a, b) => a.fullName.localeCompare(b.fullName)),
    ).toEqual([
      { fullName: 'a skipped suite would call', status: 'pending' },
      {
        fullName: 'calls and makes fewer assertions than it states',
        status: 'failed',
      },
      { fullName: 'calls and passes', status: 'passed' },
      { fullName: 'calls and passes, its cleanup fails', status: 'failed' },
      { fullName: 'calls and then fails', status: 'failed' },
    ]);
    expect([...ran].sort()).toEqual(
      [
        'assertionsMissed',
        'cleanupFails',
        'failsAfterCall',
        'passes',
        'skipped',
      ].map(fixture),
    );
  });

  it('the full run fails when a required key of this system was skipped', () => {
    expect(
      check(
        ledgerOf({
          GetProgram: fixture('passes'),
          GetDataElement: fixture('skipped'),
        }),
        'full',
      ),
    ).toEqual(['GetDataElement on onprem: not run']);
  });

  it('the full run passes when every required key passed', () => {
    expect(check(ledgerOf({ GetProgram: fixture('passes') }), 'full')).toEqual(
      [],
    );
  });

  it('a key required on the other system only is not required here', () => {
    const ledger = liveFilesOf({
      GetProgram: { unit: 'u', live: { onprem: fixture('passes') } },
      GetTable: { unit: 'u', live: { cloud: fixture('passes') } },
    });
    expect(check(ledger, 'full')).toEqual([]);
  });

  it('a family run checks only the keys of its own files', () => {
    const ledger = ledgerOf({
      GetProgram: fixture('passes'),
      GetTable: 'src/__tests__/integration/notRun.test.ts',
    });
    expect(check(ledger, 'family')).toEqual([]);
    expect(check(ledger, 'full')).toEqual(['GetTable on onprem: not run']);
  });

  it('a key whose test failed after the call is reported failed', () => {
    expect(
      check(ledgerOf({ GetClass: fixture('failsAfterCall') }), 'full'),
    ).toEqual(['GetClass on onprem: failed']);
  });

  it('a key whose afterEach cleanup fails is reported failed', () => {
    expect(
      check(ledgerOf({ GetInterface: fixture('cleanupFails') }), 'full'),
    ).toEqual(['GetInterface on onprem: failed']);
  });

  it('a key whose test misses its expect.assertions count is reported failed', () => {
    expect(
      check(ledgerOf({ GetDomain: fixture('assertionsMissed') }), 'full'),
    ).toEqual(['GetDomain on onprem: failed']);
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

  it('globalSetup refuses a selection that is not an exact integration test file', async () => {
    // A config whose destination is the stand-in: anything globalSetup sent
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
          '  abap: { destination: STAND }',
          'environment:',
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
        await expect(
          globalSetup({ rootDir: REPO, testPathPatterns: { patterns } }),
        ).rejects.toThrow('test:coverage-family');
      }
      expect(stand.requests).toEqual([]);
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
      await expect(
        globalSetup({
          rootDir: REPO,
          testPathPatterns: {
            patterns: [
              'src/__tests__/integration/high/class/ClassHighHandlers.test.ts',
            ],
          },
        }),
      ).resolves.toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
