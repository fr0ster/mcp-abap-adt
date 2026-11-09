/**
 * The live scripts (plan C2, controller ruling; D27): every npm script that
 * runs the node:test runner over the integration or admin suites is declared
 * live, runs one file at a time (`--concurrency 1`), and is the only kind of
 * run whose setup does live work; a unit run (`npm test`) does none.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { adtStandIn } from '../../helpers/adtStandIn';
import { repositoryRoot } from '../../helpers/repoRoot';
import { setUpLiveRun } from '../../integration/globalSetup';
import { assertEquals } from '../../integration/helpers/liveAssert';
import {
  LIVE_SCRIPTS,
  runnerConcurrency,
  selectsLiveSuites,
} from '../../integration/helpers/liveScripts';

const REPO = repositoryRoot(__dirname);

/** The repository's npm scripts, by name. */
function scripts(): Map<string, string> {
  const manifest: unknown = JSON.parse(
    fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'),
  );
  const declared: unknown =
    typeof manifest === 'object' && manifest !== null
      ? Reflect.get(manifest, 'scripts')
      : undefined;
  const out = new Map<string, string>();
  if (typeof declared === 'object' && declared !== null) {
    for (const [name, command] of Object.entries(declared)) {
      if (typeof command === 'string') out.set(name, command);
    }
  }
  return out;
}

describe('the live scripts', () => {
  it('every script that runs the integration or admin suites is declared live', () => {
    const live = [...scripts()]
      .filter(([, command]) => selectsLiveSuites(command))
      .map(([name]) => name);
    // The family script names no suite itself: its files come after it.
    assertEquals(
      [...live, 'test:coverage-family'].sort(),
      [...LIVE_SCRIPTS].sort(),
    );
  });

  it('every live script runs through the runner, one file at a time', () => {
    for (const name of LIVE_SCRIPTS) {
      const command = scripts().get(name) ?? '';
      assertEquals(
        { name, concurrency: runnerConcurrency(command) },
        { name, concurrency: '1' },
      );
    }
  });

  it('a live script without concurrency 1 is refused', () => {
    assert.equal(
      runnerConcurrency(
        'npm run test:build && node tools/run-tests.mjs --concurrency 2 --root src/__tests__/integration',
      ),
      '2',
    );
    assert.equal(
      runnerConcurrency(
        'node tools/run-tests.mjs --root src/__tests__/integration',
      ),
      undefined,
    );
    assert.equal(runnerConcurrency('jest --runInBand'), undefined);
  });

  it('the family script takes the files named after it and carries the ledger reporter', () => {
    // `npm run test:coverage-family -- <file>` appends the file to the
    // script; the runner takes a `….test.ts` word as a file to run.
    const command = scripts().get('test:coverage-family') ?? '';
    const words = command.split(' ');
    assert.equal(words.at(-1), '--test-reporter-destination=stdout', command);
    assert.ok(
      words.includes(
        '--test-reporter=./.test-build/tree/src/__tests__/integration/coverageReport/ledgerReporter.js',
      ),
    );
  });

  it('the unit run is not live, and a new live script would be seen', () => {
    assert.equal(selectsLiveSuites(scripts().get('test') ?? ''), false);
    assert.equal(
      selectsLiveSuites(
        'node tools/run-tests.mjs --concurrency 1 --root src/__tests__/integration/batch',
      ),
      true,
    );
    assert.equal(
      selectsLiveSuites(
        'node tools/run-tests.mjs --concurrency 1 src/__tests__/admin/shared-deps/check.test.ts',
      ),
      true,
    );
    assert.equal(
      selectsLiveSuites(
        'node tools/run-tests.mjs --concurrency 1 --root src/__tests__/unit',
      ),
      false,
    );
  });

  it('a unit run does no realm check and no logon, even with a config', async () => {
    const stand = await adtStandIn();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unit-run-'));
    const event = process.env.npm_lifecycle_event;
    const configFile = process.env.MCP_TEST_CONFIG;
    try {
      fs.mkdirSync(path.join(dir, 'sessions'));
      fs.writeFileSync(
        path.join(dir, 'sessions', 'STAND.env'),
        `SAP_URL=${stand.url}\nSAP_AUTH_TYPE=basic\n`,
      );
      const config = path.join(dir, 'test-config.yaml');
      fs.writeFileSync(
        config,
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
      process.env.MCP_TEST_CONFIG = config;
      process.env.npm_lifecycle_event = 'test';
      assert.equal(await setUpLiveRun({ rootDir: REPO, named: [] }), undefined);
      assertEquals(stand.requests, []);
    } finally {
      if (event === undefined) delete process.env.npm_lifecycle_event;
      else process.env.npm_lifecycle_event = event;
      if (configFile === undefined) delete process.env.MCP_TEST_CONFIG;
      else process.env.MCP_TEST_CONFIG = configFile;
      await stand.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('no test file outside the integration and admin suites reads a live destination', () => {
    // The words of the live-only entry points: a live destination's paths,
    // the test config's destination, its session file. A word check, not a
    // proof — the guarantee is that every live test lives under
    // integration/ or admin/, which the unit run ignores.
    const words = [
      'MCP_LIVE_ENV_PATHS',
      'getTestDestination',
      'loadTestEnv',
      'sessionVariables',
      'testSessionFile',
    ];
    const roots = [
      'src',
      ...fs
        .readdirSync(REPO, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() &&
            fs.existsSync(path.join(REPO, entry.name, 'src')) &&
            entry.name !== 'node_modules',
        )
        .map((entry) => path.join(entry.name, 'src')),
    ];
    const self = path.join(
      'src',
      '__tests__',
      'unit',
      'coverage',
      'liveScripts.test.ts',
    );
    const findings = roots.flatMap((root) =>
      fs
        .readdirSync(path.join(REPO, root), {
          recursive: true,
          encoding: 'utf8',
        })
        .map((name) => path.join(root, name))
        .filter(
          (file) =>
            file.includes(`${path.sep}__tests__${path.sep}`) &&
            file.endsWith('.ts') &&
            !file.includes(`__tests__${path.sep}integration${path.sep}`) &&
            !file.includes(`__tests__${path.sep}admin${path.sep}`) &&
            file !== self,
        )
        .flatMap((file) => {
          const text = fs.readFileSync(path.join(REPO, file), 'utf8');
          return words
            .filter((word) => text.includes(word))
            .map((word) => `${file}: ${word}`);
        }),
    );
    assertEquals(findings, []);
  });
});
