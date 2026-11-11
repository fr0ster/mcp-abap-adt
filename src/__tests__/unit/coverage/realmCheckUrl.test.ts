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

jest.mock('../../integration/helpers/realmCheck', () => {
  const actual = jest.requireActual('../../integration/helpers/realmCheck');
  return {
    ...actual,
    realmCheck: jest.fn((...args: unknown[]) => {
      const [, url] = args;
      if (typeof url === 'string') realmChecked.push(url);
      return stubRealmCheck ? Promise.resolve() : actual.realmCheck(...args);
    }),
  };
});

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AuthBrokerFactory } from '../../../../server-runtime/src/stdio/auth/brokerFactory';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import { repositoryRoot } from '../../helpers/repoRoot';
import { setUpLiveRun } from '../../integration/globalSetup';
import {
  parseRealmCheckUrls,
  realmCheckUrlMissingWords,
} from '../../integration/helpers/realmCheck';

jest.setTimeout(60_000);

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
  stand = await adtStandIn();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'realm-check-url-'));
  fs.mkdirSync(path.join(dir, 'sessions'));
  process.env.MCP_ABAP_ADT_COVERAGE_RUN = fs.mkdtempSync(
    path.join(os.tmpdir(), 'realm-check-run-'),
  );
  process.env.npm_lifecycle_event = 'test:integration';
});

afterEach(async () => {
  jest.restoreAllMocks();
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
    await expect(run()).rejects.toThrow('realm');
    expect(realmChecked).toEqual([stand.url]);
    expect(stand.requests).toHaveLength(1);
    expect(stand.requests[0]?.url).toContain('/sap/bc/adt/discovery');
    expect(stand.requests[0]?.authorization).toBeUndefined();
  });

  it('RFC: the setting is checked even where the session also states a SAP_URL', async () => {
    configure(
      [...RFC_SESSION, 'SAP_URL=https://sentinel.example.test'],
      [`realm_check_url: ${JSON.stringify(stand.url)}`],
    );
    await expect(run()).rejects.toThrow('realm');
    expect(realmChecked).toEqual([stand.url]);
  });

  it('RFC without it: refused naming the setting, nothing sent', async () => {
    configure(RFC_SESSION, []);
    await expect(run()).rejects.toThrow(
      realmCheckUrlMissingWords('environment.realm_check_url'),
    );
    expect(realmChecked).toEqual([]);
    expect(stand.requests).toEqual([]);
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
    await expect(run()).rejects.toThrow('realm');
    expect(realmChecked).toEqual([stand.url]);
    expect(stand.requests).toHaveLength(1);
  });

  it('RFC with a realm-check URL reaches the factory, which reads the stated address', async () => {
    stubRealmCheck = true;
    configure(RFC_SESSION, [`realm_check_url: ${JSON.stringify(stand.url)}`]);
    const settingsFor = jest.spyOn(AuthBrokerFactory.prototype, 'settingsFor');
    // Stopped before any logon: no RFC connection is opened.
    jest
      .spyOn(AuthBrokerFactory.prototype, 'getProvider')
      .mockRejectedValue(new Error('stopped before the logon'));
    await run();
    expect(realmChecked).toEqual([stand.url]);
    expect(settingsFor).toHaveBeenCalledWith('STAND');
    await expect(settingsFor.mock.results[0]?.value).resolves.toEqual({
      authType: 'basic',
      connectionType: 'rfc',
      client: '100',
      language: 'EN',
      ashost: 'host.example.test',
      sysnr: '00',
    });
    expect(stand.requests).toEqual([]);
  });
});

describe('MCP_LIVE_REALM_CHECK_URLS: whitespace-separated absolute http(s) URLs', () => {
  it('a URL with a port is one entry (the path delimiter splits nothing)', () => {
    expect(parseRealmCheckUrls('https://saphost.example:44300')).toEqual([
      'https://saphost.example:44300',
    ]);
  });

  it('two entries, in order; surrounding and repeated whitespace dropped', () => {
    expect(
      parseRealmCheckUrls(
        '  https://one.example.test:44300 \n\t http://two.example.test:8000  ',
      ),
    ).toEqual([
      'https://one.example.test:44300',
      'http://two.example.test:8000',
    ]);
  });

  it('none stated: no entry', () => {
    expect(parseRealmCheckUrls(undefined)).toEqual([]);
    expect(parseRealmCheckUrls('   ')).toEqual([]);
  });

  it.each(['saphost.example', 'https', 'ftp://saphost.example', '//saphost'])(
    'a non-URL entry (%s) is refused by its position, never its value',
    (entry) => {
      expect(() =>
        parseRealmCheckUrls(`https://one.example.test ${entry}`),
      ).toThrow(
        'MCP_LIVE_REALM_CHECK_URLS: entry 2 is not an absolute http(s) URL; nothing was sent',
      );
    },
  );
});
