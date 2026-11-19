/**
 * The realm check of a live run over RFC (24.0.0): an RFC destination states
 * no URL, so `globalSetup` checks the `401` realm against the test config's
 * `environment.realm_check_url` — a test-only setting that never reaches the
 * destination — and refuses, before anything is sent, an RFC run that states
 * none. Over HTTP the session's `SAP_URL` is checked, as before. An RFC
 * destination with a realm-check URL reaches the factory, which reads its
 * stated address.
 */

const realmChecked: string[] = [];
let stubRealmCheck = false;

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import { AuthBrokerFactory } from '../../../../server-runtime/src/stdio/auth/brokerFactory';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import { assertRejects, assertThrows } from '../../helpers/assertions';
import { repositoryRoot } from '../../helpers/repoRoot';
import { setUpLiveRun } from '../../integration/globalSetup';
import * as realmCheckModule from '../../integration/helpers/realmCheck';
import {
  parseRealmCheckUrls,
  realmCheckUrlMissingWords,
} from '../../integration/helpers/realmCheck';

// The real check, read before it is replaced.
const realRealmCheck = realmCheckModule.realmCheck;
/**
 * realmCheck replaced on the module that defines it (the live run's setup
 * reads it at call time): it records the URL it is asked about and runs the
 * real check unless a case stubs it, as the Jest factory did. Every case
 * restores every mock after it, so it is replaced before each.
 */
function recordRealmChecks(): void {
  mock.method(
    realmCheckModule,
    'realmCheck',
    (...args: Parameters<typeof realRealmCheck>) => {
      const [, url] = args;
      if (typeof url === 'string') realmChecked.push(url);
      return stubRealmCheck ? Promise.resolve() : realRealmCheck(...args);
    },
  );
}

const REPO = repositoryRoot(__dirname);
const SAVED = [
  'MCP_TEST_CONFIG',
  'npm_lifecycle_event',
  'MCP_ABAP_ADT_COVERAGE_RUN',
  'SAP_CONNECTION_TYPE',
  'SAP_SYSTEM_TYPE',
  'SAP_URL',
] as const;
const saved: Record<string, string | undefined> = {};

let stand: AdtStandIn;
let dir: string;

beforeEach(async () => {
  for (const key of SAVED) saved[key] = process.env[key];
  delete process.env.SAP_CONNECTION_TYPE;
  delete process.env.SAP_URL;
  realmChecked.length = 0;
  stubRealmCheck = false;
  recordRealmChecks();
  stand = await adtStandIn();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'realm-check-url-'));
  fs.mkdirSync(path.join(dir, 'sessions'));
  process.env.MCP_ABAP_ADT_COVERAGE_RUN = fs.mkdtempSync(
    path.join(os.tmpdir(), 'realm-check-run-'),
  );
  process.env.npm_lifecycle_event = 'test:integration';
});

afterEach(async () => {
  mock.restoreAll();
  await stand.close();
  fs.rmSync(dir, { recursive: true, force: true });
  for (const key of SAVED) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

/** The destination `STAND`'s session file and a test config naming it. */
function configure(sessionLines: string[], environment: string[]): void {
  fs.writeFileSync(
    path.join(dir, 'sessions', 'STAND.env'),
    `${sessionLines.join('\n')}\n`,
  );
  const config = path.join(dir, 'test-config.yaml');
  fs.writeFileSync(
    config,
    [
      'auth_broker:',
      `  paths: { service_keys_dir: ${JSON.stringify(dir)} }`,
      '  browser: none',
      'environment:',
      '  env: STAND.env',
      '  system_type: onprem',
      // A realm the stand-in does not answer: the check stops the run once it ran.
      '  expected_realm: "NOT THE STAND REALM"',
      ...environment.map((line) => `  ${line}`),
      '',
    ].join('\n'),
  );
  process.env.MCP_TEST_CONFIG = config;
}

const RFC_SESSION = [
  'SAP_CONNECTION_TYPE=rfc',
  'SAP_AUTH_TYPE=basic',
  'SAP_USERNAME=placeholder-user',
  'SAP_PASSWORD=placeholder-password',
  'SAP_ASHOST=host.example.test',
  'SAP_SYSNR=00',
  'SAP_CLIENT=100',
  'SAP_LANGUAGE=EN',
];

const run = () => setUpLiveRun({ rootDir: REPO, named: [] });

describe("globalSetup's realm check by the destination's wire", () => {
  it('RFC with environment.realm_check_url: the check runs against it', async () => {
    configure(RFC_SESSION, [`realm_check_url: ${JSON.stringify(stand.url)}`]);
    await assertRejects(run(), 'realm');
    assert.deepStrictEqual(realmChecked, [stand.url]);
    assert.equal(stand.requests.length, 1);
    assert.ok(stand.requests[0]?.url.includes('/sap/bc/adt/discovery'));
    assert.equal(stand.requests[0]?.authorization, undefined);
  });

  it('RFC: the setting is checked even where the session also states a SAP_URL', async () => {
    configure(
      [...RFC_SESSION, 'SAP_URL=https://sentinel.example.test'],
      [`realm_check_url: ${JSON.stringify(stand.url)}`],
    );
    await assertRejects(run(), 'realm');
    assert.deepStrictEqual(realmChecked, [stand.url]);
  });

  it('RFC without it: refused naming the setting, nothing sent', async () => {
    configure(RFC_SESSION, []);
    await assertRejects(
      run(),
      realmCheckUrlMissingWords('environment.realm_check_url'),
    );
    assert.deepStrictEqual(realmChecked, []);
    assert.deepStrictEqual(stand.requests, []);
  });

  it("HTTP: the session's SAP_URL is checked, the setting not read", async () => {
    configure(
      [
        `SAP_URL=${stand.url}`,
        'SAP_CONNECTION_TYPE=http',
        'SAP_AUTH_TYPE=basic',
        'SAP_USERNAME=placeholder-user',
        'SAP_PASSWORD=placeholder-password',
      ],
      ['realm_check_url: "https://other.example.test"'],
    );
    await assertRejects(run(), 'realm');
    assert.deepStrictEqual(realmChecked, [stand.url]);
    assert.equal(stand.requests.length, 1);
  });

  it('RFC with a realm-check URL reaches the factory, which reads the stated address', async (t) => {
    stubRealmCheck = true;
    configure(RFC_SESSION, [`realm_check_url: ${JSON.stringify(stand.url)}`]);
    const settingsFor = t.mock.method(
      AuthBrokerFactory.prototype,
      'settingsFor',
    );
    // Stopped before any logon: no RFC connection is opened.
    t.mock.method(AuthBrokerFactory.prototype, 'getProvider', async () => {
      throw new Error('stopped before the logon');
    });
    await run();
    assert.deepStrictEqual(realmChecked, [stand.url]);
    assert.ok(
      settingsFor.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, ['STAND']),
      ),
    );
    assert.deepStrictEqual(await settingsFor.mock.calls[0]?.result, {
      authType: 'basic',
      connectionType: 'rfc',
      client: '100',
      language: 'EN',
      ashost: 'host.example.test',
      sysnr: '00',
    });
    assert.deepStrictEqual(stand.requests, []);
  });
});

describe('MCP_LIVE_REALM_CHECK_URLS: whitespace-separated absolute http(s) URLs', () => {
  it('a URL with a port is one entry (the path delimiter splits nothing)', () => {
    assert.deepStrictEqual(
      parseRealmCheckUrls('https://saphost.example:44300'),
      ['https://saphost.example:44300'],
    );
  });

  it('two entries, in order; surrounding and repeated whitespace dropped', () => {
    assert.deepStrictEqual(
      parseRealmCheckUrls(
        '  https://one.example.test:44300 \n\t http://two.example.test:8000  ',
      ),
      ['https://one.example.test:44300', 'http://two.example.test:8000'],
    );
  });

  it('none stated: no entry', () => {
    assert.deepStrictEqual(parseRealmCheckUrls(undefined), []);
    assert.deepStrictEqual(parseRealmCheckUrls('   '), []);
  });

  for (const entry of [
    'saphost.example',
    'https',
    'ftp://saphost.example',
    '//saphost',
  ]) {
    it(
      format(
        'a non-URL entry (%s) is refused by its position, never its value',
        entry,
      ),
      () => {
        assertThrows(
          () => parseRealmCheckUrls(`https://one.example.test ${entry}`),
          'MCP_LIVE_REALM_CHECK_URLS: entry 2 is not an absolute http(s) URL; nothing was sent',
        );
      },
    );
  }
});
