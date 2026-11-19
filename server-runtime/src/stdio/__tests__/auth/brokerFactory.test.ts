import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import {
  type AuthBroker,
  DestinationConfigError,
} from '@mcp-abap-adt/auth-broker';
import { classify } from '@mcp-abap-adt/auth-errors';
import type {
  AuthOutcome,
  AuthorizationRequest,
  IAuthorizationStrategy,
  IAuthProvider,
  IAuthRejection,
  IBrowser,
} from '@mcp-abap-adt/interfaces-auth';
import {
  assertMatchObject,
  assertRejects,
  rejectionOf,
} from '../../../../../src/__tests__/helpers/assertions';
import {
  getTimerCount,
  useFakeTimers,
  useRealTimers,
} from '../../../../../src/__tests__/helpers/fakeTime';
import { authBroker as authBrokerModule } from '../../../../../src/__tests__/helpers/packageFiles';
import { AuthBrokerFactory } from '../../auth/brokerFactory';
import { SHUTDOWN_REFUSAL } from '../../auth/countedProvider';
import {
  destinationFailureWords,
  JWT_NONE_HINT,
  UnsupportedAuthenticationError,
} from '../../auth/destinationFailure';
import type {
  IAuthBrokerFactoryConfig,
  LoginStrategyOptions,
} from '../../auth/IAuthBrokerFactoryConfig';

/**
 * Every broker the factory constructs, recorded: AuthBroker watched on the
 * module that defines it (the package index re-exports it by getter, read
 * at call time); the real broker is still constructed, as the Jest
 * factory's passthrough did. Every case restores every mock after it, so it
 * is watched afresh before each.
 */
function watchBrokers() {
  return mock.method(authBrokerModule, 'AuthBroker');
}
let constructed: ReturnType<typeof watchBrokers>;
/** The fs module itself: `import * as` yields a copy whose getters cannot be spied. */
// The real module, not an import copy: the spies below go on it.
import nodeFs = require('node:fs');

/** A member the config type leaves optional, which the case requires: Jest read it untyped. */
function present<T>(value: T | undefined): T {
  assert.ok(value !== undefined);
  return value;
}

const SYSTEM_URL = 'https://system.example.test';
const XSUAA_SYSTEM_URL = 'https://xsuaa-system.example.test';
const REDIRECT = 'http://localhost:61001/callback';
const OK: AuthOutcome = { ok: true };
const REJECTION_401: IAuthRejection = {
  at: 'request',
  status: 401,
  error: new Error('401'),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const tick = () => new Promise((r) => setImmediate(r));

const BROWSER: IBrowser = { open: async () => {} };
const silent = { info() {}, warn() {}, error() {}, debug() {} };

function strategyFactory() {
  const calls: LoginStrategyOptions[] = [];
  const browserStrategy = (
    options: LoginStrategyOptions,
  ): IAuthorizationStrategy<string> => {
    calls.push(options);
    return {
      authorize: async (request: AuthorizationRequest) => {
        await request.buildAuthorizationUrl(REDIRECT);
        return { payload: 'code-1', redirectUri: REDIRECT };
      },
    };
  };
  return { browserStrategy, calls };
}

/** An inner provider the test holds open. */
function heldInner() {
  const held = deferred<AuthOutcome>();
  const calls: string[] = [];
  const inner: IAuthProvider = {
    kind: 'held',
    prepare: async () => {
      calls.push('prepare');
      return held.promise;
    },
    establish: async () => {
      calls.push('establish');
      return held.promise;
    },
    authorize: async () => {
      calls.push('authorize');
      return held.promise;
    },
    rejected: async () => {
      calls.push('rejected');
      return held.promise;
    },
  };
  return { inner, calls, release: () => held.resolve(OK) };
}

describe('AuthBrokerFactory', () => {
  let root: string;
  let keysDir: string;
  let sessionsDir: string;
  let strategies: ReturnType<typeof strategyFactory>;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'broker-factory-'));
    keysDir = path.join(root, 'service-keys');
    sessionsDir = path.join(root, 'sessions');
    fs.mkdirSync(keysDir);
    fs.mkdirSync(sessionsDir);
    strategies = strategyFactory();
    constructed = watchBrokers();
  });
  afterEach(() => {
    mock.restoreAll();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const factory = (over: Partial<IAuthBrokerFactoryConfig> = {}) =>
    new AuthBrokerFactory({
      authBrokerPath: root,
      unsafe: false,
      connectionType: 'http',
      browserStrategy: strategies.browserStrategy,
      promptLogger: silent,
      ...over,
    });

  const writeSession = (name: string, lines: string[]) =>
    fs.writeFileSync(
      path.join(sessionsDir, `${name}.env`),
      `${lines.join('\n')}\n`,
    );
  const writeKey = (name: string, body: unknown) =>
    fs.writeFileSync(path.join(keysDir, `${name}.json`), JSON.stringify(body));
  const basic = (name: string, extra: string[] = []) =>
    writeSession(name, [
      `SAP_URL=${SYSTEM_URL}`,
      'SAP_CLIENT=100',
      'SAP_AUTH_TYPE=basic',
      'SAP_USERNAME=placeholder-user',
      'SAP_PASSWORD=placeholder-password',
      ...extra,
    ]);
  const abapKey = {
    url: SYSTEM_URL,
    abap: { url: SYSTEM_URL, client: '100' },
    uaa: {
      url: 'https://uaa.example.test',
      clientid: 'client-id',
      clientsecret: 'client-secret',
    },
  };
  const xsuaaKey = (url: string) => ({
    url,
    clientid: 'xs-client-id',
    clientsecret: 'xs-client-secret',
  });

  async function caught(p: Promise<unknown>): Promise<unknown> {
    try {
      await p;
    } catch (e) {
      return e;
    }
    throw new Error('expected a rejection');
  }

  describe('getBroker', () => {
    it('twice for one destination builds one broker', async () => {
      basic('dest');
      const f = factory();
      const a = await f.getBroker('dest');
      const b = await f.getBroker('dest');
      assert.equal(a, b);
      assert.equal(constructed.mock.callCount(), 1);
    });

    it('two concurrent first calls build one broker', async () => {
      basic('dest');
      const f = factory();
      const [a, b] = await Promise.all([
        f.getBroker('dest'),
        f.getBroker('dest'),
      ]);
      assert.equal(a, b);
      assert.equal(constructed.mock.callCount(), 1);
    });

    for (const name of ['../../etc/x', 'a/b', '.hidden', '']) {
      it(
        format(
          'refuses the name %j before any file is touched, naming "destination"',
          name,
        ),
        async (t) => {
          const read = t.mock.method(nodeFs, 'readFileSync');
          const exists = t.mock.method(nodeFs, 'existsSync');
          const f = factory();
          const err = await caught(f.getBroker(name));
          assert.match((err as Error).message, /^destination: /);
          assert.equal(read.mock.callCount(), 0);
          assert.equal(exists.mock.callCount(), 0);
          assert.equal(constructed.mock.callCount(), 0);
          await assertRejects(f.getProvider(name), /^destination: /);
          await assertRejects(f.settingsFor(name), /^destination: /);
        },
      );
    }

    it('(control) a valid name does read through the spied fs', async (t) => {
      basic('dest');
      const read = t.mock.method(nodeFs, 'readFileSync');
      await factory().getBroker('dest');
      assert.ok(read.mock.callCount() > 0);
    });

    it('a failed build is not cached: fixing the file lets the next call build', async () => {
      writeSession('dest', [`SAP_URL=${SYSTEM_URL}`]);
      const f = factory();
      assert.ok(
        (await rejectionOf(f.getBroker('dest'))) instanceof
          DestinationConfigError,
      );
      basic('dest');
      assert.notEqual(await f.getBroker('dest'), undefined);
    });
  });

  describe('the three steps', () => {
    for (const [_l, lines, field] of [
      ['authType absent', [`SAP_URL=${SYSTEM_URL}`], 'authType'],
      [
        'authType unknown',
        [`SAP_URL=${SYSTEM_URL}`, 'SAP_AUTH_TYPE=made-up-type-q7'],
        'authType',
      ],
      [
        'jwt without a grant',
        [`SAP_URL=${SYSTEM_URL}`, 'SAP_AUTH_TYPE=jwt'],
        'grantType',
      ],
      [
        'jwt with an empty grant',
        [`SAP_URL=${SYSTEM_URL}`, 'SAP_AUTH_TYPE=jwt', 'SAP_GRANT_TYPE='],
        'grantType',
      ],
      [
        'jwt with an unknown grant',
        [
          `SAP_URL=${SYSTEM_URL}`,
          'SAP_AUTH_TYPE=jwt',
          'SAP_GRANT_TYPE=made-up-grant-q7',
        ],
        'grantType',
      ],
    ] satisfies [string, string[], string][]) {
      it(format('1. %s: DestinationConfigError, no broker', _l), async () => {
        writeSession('dest', lines);
        const err = await caught(factory().getBroker('dest'));
        assert.ok(err instanceof DestinationConfigError);
        assert.deepStrictEqual((err as DestinationConfigError).missingFields, [
          field,
        ]);
        assert.ok(!(err as Error).message.includes('made-up'));
        assert.equal(constructed.mock.callCount(), 0);
      });
    }

    for (const [authType, grantType] of [
      ['jwt', 'client_credentials'],
      ['jwt', 'passcode'],
      ['jwt', 'none'],
      ['saml', 'saml2_bearer'],
    ]) {
      it(
        format(
          '2. %s / %s: UnsupportedAuthenticationError, no broker, no provider',
          authType,
          grantType,
        ),
        async () => {
          writeSession('dest', [
            `SAP_URL=${SYSTEM_URL}`,
            `SAP_AUTH_TYPE=${authType}`,
            `SAP_GRANT_TYPE=${grantType}`,
          ]);
          const f = factory();
          const err = await caught(f.getBroker('dest'));
          assert.ok(err instanceof UnsupportedAuthenticationError);
          assertMatchObject(err, { destination: 'dest', authType, grantType });
          assert.ok(
            (await rejectionOf(f.getProvider('dest'))) instanceof
              UnsupportedAuthenticationError,
          );
          assert.equal(constructed.mock.callCount(), 0);
        },
      );
    }

    for (const authType of ['certificate', 'kerberos']) {
      it(
        format(
          '2b. %s .env: UnsupportedAuthenticationError naming it, no broker, no value',
          authType,
        ),
        async () => {
          writeSession('dest', [
            `SAP_URL=${SYSTEM_URL}`,
            `SAP_AUTH_TYPE=${authType}`,
            'SAP_CERT_PATH=/made-up/secret-path',
          ]);
          const err = await caught(factory().getBroker('dest'));
          assert.ok(err instanceof UnsupportedAuthenticationError);
          assertMatchObject(err, { destination: 'dest', authType });
          assert.ok((err as Error).message.includes(authType));
          assert.ok(!(err as Error).message.includes('secret-path'));
          assert.equal(constructed.mock.callCount(), 0);
        },
      );
    }

    it("3. basic: the broker gets the stores and the server's options, no handler option", async () => {
      basic('dest');
      await factory().getBroker('dest');
      assert.equal(constructed.mock.callCount(), 1);
      const config = constructed.mock.calls[0]?.arguments[0];
      assert.deepStrictEqual(Object.keys(config).sort(), [
        'authDebug',
        'onWriteFailure',
        'renewal',
        'serviceKeyStore',
        'sessionStore',
      ]);
      // the destination's own stores, observed through their answers
      assert.equal(
        (await present(config.serviceKeyStore).getConnectionConfig('dest'))
          ?.authType,
        'basic',
      );
      assert.equal(await config.sessionStore.loadSession('dest'), null);
    });

    it('3. jwt / none: a token you hold is refused at the handler table, with the hint where it went', async () => {
      const file = path.join(root, 'conn.env');
      fs.writeFileSync(
        file,
        [
          `SAP_URL=${SYSTEM_URL}`,
          'SAP_AUTH_TYPE=jwt',
          'SAP_GRANT_TYPE=none',
          'SAP_JWT_TOKEN=placeholder-token',
        ].join('\n'),
      );
      const err = await caught(
        factory({ envFile: { path: file, source: '--env' } }).getBroker(
          'default',
        ),
      );
      assert.ok(err instanceof UnsupportedAuthenticationError);
      assert.equal(
        destinationFailureWords(err, 'default'),
        `Destination "default" uses jwt / none, which this server does not support\n${JWT_NONE_HINT}`,
      );
      assert.equal(constructed.mock.callCount(), 0);
    });

    it('3. jwt / authorization_code: the stores, the options and the login strategy in serverLogin', async () => {
      writeKey('dest', abapKey);
      await factory({ browser: BROWSER, browserAuthPort: 61005 }).getBroker(
        'dest',
      );
      const config = constructed.mock.calls[0]?.arguments[0];
      assert.deepStrictEqual(Object.keys(config).sort(), [
        'authDebug',
        'authorization',
        'onWriteFailure',
        'renewal',
        'serviceKeyStore',
        'sessionStore',
      ]);
      const strategy = present(config.authorization)(
        'dest',
        'authorization_code',
      );
      const outcome = await strategy.authorize({
        buildAuthorizationUrl: async () => 'https://idp.example.test/authorize',
      });
      assert.equal(outcome.payload, 'code-1');
      assert.deepStrictEqual(strategies.calls, [
        { browser: BROWSER, port: 61005 },
      ]);
      assert.equal(
        (await present(config.serviceKeyStore).getConnectionConfig('dest'))
          ?.grantType,
        'authorization_code',
      );
    });
  });

  describe('settingsFor', () => {
    it('answers url, client, auth type and connection type — no secret', async () => {
      basic('dest');
      const settings = await factory().settingsFor('dest');
      assert.deepStrictEqual(settings, {
        url: SYSTEM_URL,
        client: '100',
        authType: 'basic',
        connectionType: 'http',
      });
      assert.ok(!JSON.stringify(settings).includes('placeholder-password'));
    });

    it('no token or refresh token of a stored jwt session', async () => {
      const file = path.join(root, 'conn.env');
      fs.writeFileSync(
        file,
        [
          `SAP_URL=${SYSTEM_URL}`,
          'SAP_AUTH_TYPE=jwt',
          'SAP_GRANT_TYPE=authorization_code',
          'SAP_UAA_URL=https://uaa.example.test',
          'SAP_UAA_CLIENT_ID=client-id',
          'SAP_UAA_CLIENT_SECRET=client-secret',
          'SAP_JWT_TOKEN=placeholder-token',
          'SAP_REFRESH_TOKEN=placeholder-refresh',
          `SAP_ISSUED_FOR=${SYSTEM_URL}`,
          'SAP_ISSUED_BY=placeholder-issuer-record',
        ].join('\n'),
      );
      const settings = await factory({
        envFile: { path: file, source: '--env' },
      }).settingsFor('default');
      assert.deepStrictEqual(settings, {
        url: SYSTEM_URL,
        authType: 'jwt',
        connectionType: 'http',
      });
    });

    it('read once per process: a changed file after the first call changes nothing', async () => {
      basic('dest');
      const f = factory();
      const first = await f.settingsFor('dest');
      writeSession('dest', [
        'SAP_URL=https://changed.example.test',
        'SAP_CLIENT=200',
        'SAP_AUTH_TYPE=basic',
        'SAP_USERNAME=placeholder-user',
        'SAP_PASSWORD=placeholder-password',
      ]);
      assert.deepStrictEqual(await f.settingsFor('dest'), first);
      assert.equal(first.url, SYSTEM_URL);
      assert.equal(first.client, '100');
    });

    it('XSUAA_MCP_URL is read once too', async () => {
      writeKey('dest', xsuaaKey('https://tenant.example.test'));
      writeSession('dest', [`XSUAA_MCP_URL=${XSUAA_SYSTEM_URL}`]);
      const f = factory();
      await f.settingsFor('dest');
      writeSession('dest', ['XSUAA_MCP_URL=https://changed.example.test']);
      assert.equal((await f.settingsFor('dest')).url, XSUAA_SYSTEM_URL);
    });

    it('a failed read is not cached: fixing the file lets the next call answer', async () => {
      writeKey('dest', xsuaaKey('https://tenant.example.test'));
      const f = factory();
      assert.ok(
        (await rejectionOf(f.settingsFor('dest'))) instanceof
          DestinationConfigError,
      );
      writeSession('dest', [`XSUAA_MCP_URL=${XSUAA_SYSTEM_URL}`]);
      assert.equal((await f.settingsFor('dest')).url, XSUAA_SYSTEM_URL);
    });

    it('no URL: DestinationConfigError naming SAP_URL', async () => {
      writeSession('dest', ['SAP_AUTH_TYPE=basic', 'SAP_USERNAME=u']);
      const err = await caught(factory().settingsFor('dest'));
      assert.ok(err instanceof DestinationConfigError);
      assert.deepStrictEqual((err as DestinationConfigError).missingFields, [
        'SAP_URL',
      ]);
    });

    const keyUrls = [
      ['a UAA url', 'https://tenant.authentication.example.test'],
      ['a url without "authentication"', 'https://tenant.example.test'],
    ] as const;

    for (const [_l, keyUrl] of keyUrls) {
      it(
        format('XSUAA key with %s: the URL is XSUAA_MCP_URL', _l),
        async () => {
          writeKey('dest', xsuaaKey(keyUrl));
          writeSession('dest', [`XSUAA_MCP_URL=${XSUAA_SYSTEM_URL}`]);
          const settings = await factory().settingsFor('dest');
          assert.equal(settings.url, XSUAA_SYSTEM_URL);
          assert.equal(settings.authType, 'jwt');
        },
      );
    }

    for (const [_l, keyUrl] of keyUrls) {
      it(
        format(
          'XSUAA key with %s and SAP_URL instead: refused naming XSUAA_MCP_URL',
          _l,
        ),
        async () => {
          writeKey('dest', xsuaaKey(keyUrl));
          writeSession('dest', [`SAP_URL=${SYSTEM_URL}`]);
          const err = await caught(factory().settingsFor('dest'));
          assert.ok(err instanceof DestinationConfigError);
          assert.deepStrictEqual(
            (err as DestinationConfigError).missingFields,
            ['XSUAA_MCP_URL'],
          );
        },
      );
    }

    for (const [_l, keyUrl] of keyUrls) {
      it(
        format(
          'XSUAA key with %s and no session file: refused naming XSUAA_MCP_URL',
          _l,
        ),
        async () => {
          writeKey('dest', xsuaaKey(keyUrl));
          const err = await caught(factory().settingsFor('dest'));
          assert.deepStrictEqual(
            (err as DestinationConfigError).missingFields,
            ['XSUAA_MCP_URL'],
          );
        },
      );
    }

    const snc = () =>
      writeSession('dest', [
        `SAP_URL=${SYSTEM_URL}`,
        'SAP_AUTH_TYPE=snc',
        'SAP_SNC_PARTNERNAME=p:placeholder',
      ]);

    it('SNC over http: refused naming connection-type', async () => {
      snc();
      const err = await caught(
        factory({ connectionType: 'http' }).settingsFor('dest'),
      );
      assert.ok(err instanceof DestinationConfigError);
      assert.deepStrictEqual((err as DestinationConfigError).missingFields, [
        'connection-type',
      ]);
    });

    it('SNC over rfc: accepted, its address as stated and no URL', async () => {
      writeSession('dest', [
        'SAP_AUTH_TYPE=snc',
        'SAP_SNC_PARTNERNAME=p:placeholder',
        'SAP_ASHOST=system.example.test',
        'SAP_SYSNR=00',
        'SAP_CLIENT=100',
        'SAP_LANGUAGE=EN',
      ]);
      assert.deepStrictEqual(
        await factory({ connectionType: 'rfc' }).settingsFor('dest'),
        {
          authType: 'snc',
          connectionType: 'rfc',
          client: '100',
          language: 'EN',
          ashost: 'system.example.test',
          sysnr: '00',
        },
      );
    });
  });

  /**
   * The destination's own responsible and master system, from the file the
   * destination's means are read from: sessions/<name>.env for a named
   * destination, the --env file for `default`. Never another destination's.
   */
  describe('systemContextFor', () => {
    it("a named destination: its sessions/<name>.env's SAP_RESPONSIBLE and SAP_MASTER_SYSTEM", async () => {
      basic('dest', [
        'SAP_RESPONSIBLE=responsible-of-dest',
        'SAP_MASTER_SYSTEM=system-of-dest',
      ]);
      basic('other', ['SAP_MASTER_SYSTEM=system-of-other']);
      const f = factory();
      assert.deepStrictEqual(await f.systemContextFor('dest'), {
        responsible: 'responsible-of-dest',
        login: 'placeholder-user',
        masterSystem: 'system-of-dest',
      });
      // SAP_RESPONSIBLE unset: no responsible; the login is a fallback the
      // request resolves after every SAP_RESPONSIBLE (process included).
      assert.deepStrictEqual(await f.systemContextFor('other'), {
        login: 'placeholder-user',
        masterSystem: 'system-of-other',
      });
    });

    it('the --env file serves `default`', async () => {
      const file = path.join(root, 'conn.env');
      fs.writeFileSync(
        file,
        [
          `SAP_URL=${SYSTEM_URL}`,
          'SAP_CLIENT=100',
          'SAP_AUTH_TYPE=basic',
          'SAP_USERNAME=placeholder-user',
          'SAP_PASSWORD=placeholder-password',
          'SAP_MASTER_SYSTEM=system-of-file',
        ].join('\n'),
      );
      assert.deepStrictEqual(
        await factory({
          envFile: { path: file, source: '--env' },
        }).systemContextFor('default'),
        {
          login: 'placeholder-user',
          masterSystem: 'system-of-file',
        },
      );
    });

    it('a destination that states neither answers nothing — the process environment is not read here', async () => {
      const saved = process.env.SAP_MASTER_SYSTEM;
      process.env.SAP_MASTER_SYSTEM = 'system-of-process';
      try {
        writeKey('dest', abapKey);
        assert.deepStrictEqual(await factory().systemContextFor('dest'), {});
      } finally {
        if (saved === undefined) delete process.env.SAP_MASTER_SYSTEM;
        else process.env.SAP_MASTER_SYSTEM = saved;
      }
    });

    it('a name that is a path is refused before any file is read', async () => {
      await assertRejects(factory().systemContextFor('../x'), /^destination: /);
    });
  });

  describe('getProvider', () => {
    it('a named jwt / none destination: refused as unsupported, with the hint where it went, no token in the words', async () => {
      writeSession('dest', [
        `SAP_URL=${SYSTEM_URL}`,
        'SAP_AUTH_TYPE=jwt',
        'SAP_GRANT_TYPE=none',
        'SAP_JWT_TOKEN=placeholder-token',
      ]);
      const err = await caught(factory({ unsafe: false }).getProvider('dest'));
      assert.ok(err instanceof UnsupportedAuthenticationError);
      const text = destinationFailureWords(err, 'dest');
      assert.equal(
        text,
        `Destination "dest" uses jwt / none, which this server does not support\n${JWT_NONE_HINT}`,
      );
      assert.ok(!text.includes('placeholder-token'));
    });

    it('the same counted object for every call on a destination (the broker answers one provider)', async () => {
      basic('dest');
      const f = factory();
      const [a, b] = await Promise.all([
        f.getProvider('dest'),
        f.getProvider('dest'),
      ]);
      const c = await f.getProvider('dest');
      assert.equal(a, b);
      assert.equal(a, c);
      const inner = await (await f.getBroker('dest')).getProvider('dest');
      assert.notEqual(a, inner);
      assert.equal(a.kind, inner.kind);
    });
  });

  describe('settle', () => {
    async function withHeld(f: AuthBrokerFactory, name: string) {
      const broker = await f.getBroker(name);
      const held = heldInner();
      mock.method(broker, 'getProvider', async () => held.inner);
      return { broker, ...held };
    }

    it('closes the gate before waiting: a provider handed out after settle starts answers the shutdown refusal', async () => {
      basic('dest');
      basic('other');
      const f = factory();
      const { calls, release } = await withHeld(f, 'dest');
      const p = await f.getProvider('dest');
      const running = p.rejected(REJECTION_401);
      const settling = f.settle();
      const later = await f.getProvider('other');
      assert.deepStrictEqual(await later.prepare(), SHUTDOWN_REFUSAL);
      assert.deepStrictEqual(await p.authorize({} as never), SHUTDOWN_REFUSAL);
      assert.deepStrictEqual(calls, ['rejected']);
      release();
      await running;
      assert.deepStrictEqual(await settling, { notStored: [] });
    });

    it('waits for a held call, then flushes every broker built, once each', async (t) => {
      basic('dest');
      basic('other');
      const f = factory();
      const events: string[] = [];
      const { broker, release } = await withHeld(f, 'dest');
      const other = await f.getBroker('other');
      const [destFlush, otherFlush] = (
        [
          ['dest', broker],
          ['other', other],
        ] as Array<[string, AuthBroker]>
      ).map(([name, b]) =>
        t.mock.method(b, 'flush', async () => {
          events.push(`flush ${name}`);
        }),
      );
      const p = await f.getProvider('dest');
      const running = p.rejected(REJECTION_401).then((o) => {
        events.push('answered');
        return o;
      });
      const settling = f.settle();
      await tick();
      await tick();
      assert.deepStrictEqual(events, []);
      release();
      await running;
      assert.deepStrictEqual(await settling, { notStored: [] });
      assert.equal(events[0], 'answered');
      assert.deepStrictEqual(events.slice(1).sort(), [
        'flush dest',
        'flush other',
      ]);
      assert.equal(destFlush?.mock.callCount(), 1);
      assert.equal(otherFlush?.mock.callCount(), 1);
    });

    it('has no deadline: a held call keeps settle() waiting until it answers', async (t) => {
      // Jest's default fakes.
      useFakeTimers({
        apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'],
      });
      try {
        basic('dest');
        const f = factory();
        const { broker, release } = await withHeld(f, 'dest');
        const flush = t.mock.method(broker, 'flush');
        const p = await f.getProvider('dest');
        const running = p.prepare();
        let done = false;
        const settling = f.settle().then((report) => {
          done = true;
          return report;
        });
        for (let i = 0; i < 10; i += 1) await Promise.resolve();
        // No timer of the server's: nothing to advance to.
        assert.equal(getTimerCount(), 0);
        mock.timers.tick(60 * 60_000);
        for (let i = 0; i < 10; i += 1) await Promise.resolve();
        assert.equal(done, false);
        assert.equal(flush.mock.callCount(), 0);
        release();
        await running;
        assert.deepStrictEqual(await settling, { notStored: [] });
        assert.equal(flush.mock.callCount(), 1);
      } finally {
        useRealTimers();
      }
    });

    it("the shutdown's signal releases the drain and reaches flush()", async (t) => {
      basic('dest');
      const f = factory();
      const { broker, release } = await withHeld(f, 'dest');
      const flush = t.mock.method(broker, 'flush', async () => undefined);
      const p = await f.getProvider('dest');
      const running = p.prepare();
      const forced = new AbortController();
      const settling = f.settle({ signal: forced.signal });
      forced.abort();
      assert.deepStrictEqual(await settling, { notStored: [] });
      assert.ok(
        flush.mock.calls.some((c) =>
          isDeepStrictEqual(c.arguments, [{ signal: forced.signal }]),
        ),
      );
      release();
      await running;
    });

    it('reports a rejecting flush() as destination and classified reason only', async (t) => {
      basic('dest');
      basic('other');
      const f = factory();
      const a = await f.getBroker('dest');
      const b = await f.getBroker('other');
      const storeError = new Error('"dest": StorageError placeholder-secret');
      t.mock.method(a, 'flush', async () => {
        throw new AggregateError(
          [storeError],
          'Session writes still failing for "dest" placeholder-secret',
        );
      });
      class OddStoreFailure extends Error {}
      const odd = new OddStoreFailure('placeholder-secret');
      t.mock.method(b, 'flush', async () => {
        throw odd;
      });
      const report = await f.settle();
      assert.deepStrictEqual(report.notStored.sort(), [
        `"dest": ${classify(storeError, 'persisting-tokens').reason}`,
        `"other": ${classify(odd, 'persisting-tokens').reason}`,
      ]);
      assert.ok(!JSON.stringify(report).includes('placeholder-secret'));
      assert.ok(!JSON.stringify(report).includes('OddStoreFailure'));
    });
  });

  describe('defaultDestination', () => {
    it('--mcp=X → X', () => {
      assert.equal(
        factory({ mcpDestination: 'dest' }).defaultDestination,
        'dest',
      );
    });
    it('an env file → default', () => {
      assert.equal(
        factory({
          envFile: { path: path.join(root, 'conn.env'), source: '--env' },
        }).defaultDestination,
        'default',
      );
    });
    it('neither → undefined', () => {
      assert.equal(factory().defaultDestination, undefined);
    });
  });

  describe('an --env file', () => {
    it('a missing file is refused naming the parameter and the path', async () => {
      const missing = path.join(root, 'nope.env');
      const err = await caught(
        factory({
          envFile: { path: missing, source: '--env-path' },
        }).getBroker('default'),
      );
      assert.equal(
        (err as Error).message,
        `--env-path: the file does not exist: ${missing}`,
      );
    });

    it('a named destination beside it reads its own stores', async () => {
      const file = path.join(root, 'conn.env');
      fs.writeFileSync(file, `SAP_URL=${SYSTEM_URL}\nSAP_AUTH_TYPE=basic\n`);
      basic('dest');
      const f = factory({ envFile: { path: file, source: '--env' } });
      assert.equal((await f.settingsFor('dest')).client, '100');
      assert.equal((await f.settingsFor('default')).client, undefined);
    });
  });

  /**
   * Shutdown during a refresh, through the real broker and the real
   * AuthorizationCodeProvider: the token endpoint is a local server the test
   * holds; the session store is the --env file, written back by the broker.
   */
  describe('shutdown and a refresh (real broker, local token endpoint)', () => {
    let server: http.Server;
    let uaaUrl: string;
    let tokenRequests: string[];
    let refreshArrived: ReturnType<typeof deferred<void>>;
    let releaseRefresh: () => void;
    let envFile: string;

    const jwt = (sub: string) =>
      [
        Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
          'base64url',
        ),
        Buffer.from(
          JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600 }),
        ).toString('base64url'),
        'sig',
      ].join('.');
    const ACCESS_1 = jwt('placeholder-access-1');
    const ACCESS_2 = jwt('placeholder-access-2');

    before(() => {
      process.env.NO_PROXY = '127.0.0.1,localhost';
      process.env.no_proxy = '127.0.0.1,localhost';
    });

    beforeEach(async () => {
      tokenRequests = [];
      refreshArrived = deferred<void>();
      const refreshGate = deferred<void>();
      releaseRefresh = () => refreshGate.resolve();
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => {
          body += c;
        });
        req.on('end', async () => {
          const grant = new URLSearchParams(body).get('grant_type') ?? '';
          tokenRequests.push(grant);
          const answer = (access: string, refresh: string) => {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(
              JSON.stringify({
                access_token: access,
                refresh_token: refresh,
                expires_in: 3600,
                token_type: 'bearer',
              }),
            );
          };
          if (grant === 'authorization_code') {
            answer(ACCESS_1, 'placeholder-refresh-1');
            return;
          }
          refreshArrived.resolve();
          await refreshGate.promise;
          answer(ACCESS_2, 'placeholder-refresh-2');
        });
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      uaaUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      envFile = path.join(root, 'conn.env');
      fs.writeFileSync(
        envFile,
        [
          `SAP_URL=${SYSTEM_URL}`,
          'SAP_AUTH_TYPE=jwt',
          'SAP_GRANT_TYPE=authorization_code',
          `SAP_UAA_URL=${uaaUrl}`,
          'SAP_UAA_CLIENT_ID=client-id',
          'SAP_UAA_CLIENT_SECRET=client-secret',
          '',
        ].join('\n'),
      );
    });

    afterEach(async () => {
      releaseRefresh();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    });

    /** Logs in (unheld), then starts a refresh the endpoint holds. */
    async function refreshing(f: AuthBrokerFactory) {
      const provider = await f.getProvider('default');
      assert.deepStrictEqual(await provider.prepare(), OK);
      assert.ok(fs.readFileSync(envFile, 'utf8').includes(ACCESS_1));
      const answered = provider.rejected(REJECTION_401);
      await refreshArrived.promise;
      return { provider, answered };
    }

    it('a refresh held while settle() runs: it answers and its token is stored', async () => {
      const f = factory({ envFile: { path: envFile, source: '--env' } });
      const { answered } = await refreshing(f);
      let settled = false;
      const settling = f.settle().then((r) => {
        settled = true;
        return r;
      });
      await tick();
      await tick();
      assert.equal(settled, false);
      releaseRefresh();
      assert.deepStrictEqual(await answered, OK);
      assert.deepStrictEqual(await settling, { notStored: [] });
      const stored = fs.readFileSync(envFile, 'utf8');
      assert.ok(stored.includes(`SAP_JWT_TOKEN=${ACCESS_2}`));
      assert.ok(stored.includes('SAP_REFRESH_TOKEN=placeholder-refresh-2'));
      assert.deepStrictEqual(tokenRequests, [
        'authorization_code',
        'refresh_token',
      ]);
    });

    it('a 401 after settle began: the shutdown refusal, the inner provider never called, nothing written after the flush', async (t) => {
      const f = factory({ envFile: { path: envFile, source: '--env' } });
      const { provider, answered } = await refreshing(f);
      const broker = await f.getBroker('default');
      const inner = await broker.getProvider('default');
      const innerRejected = t.mock.method(inner, 'rejected');
      const flush = t.mock.method(broker, 'flush');

      const settling = f.settle();
      // A request on the wire comes back 401 while settle waits. Raced
      // against a timer: forwarded, it would join the held refresh and wait.
      const verdict = await Promise.race([
        provider.rejected(REJECTION_401),
        new Promise((r) => setTimeout(() => r('still waiting'), 1_000)),
      ]);
      assert.deepStrictEqual(verdict, SHUTDOWN_REFUSAL);
      assert.equal(innerRejected.mock.callCount(), 0);

      releaseRefresh();
      await answered;
      await settling;
      assert.equal(flush.mock.callCount(), 1);
      const afterFlush = fs.readFileSync(envFile, 'utf8');

      // And after settle: still refused, still not forwarded.
      assert.deepStrictEqual(
        await provider.rejected(REJECTION_401),
        SHUTDOWN_REFUSAL,
      );
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(innerRejected.mock.callCount(), 0);
      assert.deepStrictEqual(tokenRequests, [
        'authorization_code',
        'refresh_token',
      ]);
      assert.equal(fs.readFileSync(envFile, 'utf8'), afterFlush);
    });
  });
});
