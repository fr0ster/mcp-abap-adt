import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

jest.mock('@mcp-abap-adt/auth-broker', () => {
  const actual = jest.requireActual('@mcp-abap-adt/auth-broker');
  return {
    ...actual,
    AuthBroker: jest.fn(
      (config: unknown, logger: unknown) =>
        new actual.AuthBroker(config, logger),
    ),
  };
});

import {
  type AuthBroker,
  AuthBroker as AuthBrokerCtor,
  DestinationConfigError,
} from '@mcp-abap-adt/auth-broker';
import type {
  AuthOutcome,
  AuthorizationRequest,
  IAuthorizationStrategy,
  IAuthProvider,
  IAuthRejection,
} from '@mcp-abap-adt/interfaces-auth';
import {
  describeAuthError,
  UnsupportedAuthenticationError,
  vetMeans,
} from '@mcp-abap-adt/lib/auth';
import { AuthBrokerFactory } from '../../auth/brokerFactory';
import { SHUTDOWN_REFUSAL } from '../../auth/countedProvider';
import type { IAuthBrokerFactoryConfig } from '../../auth/IAuthBrokerFactoryConfig';

const constructed = AuthBrokerCtor as unknown as jest.Mock;
/** The fs module itself: `import * as` yields a copy whose getters cannot be spied. */
const nodeFs: typeof fs = jest.requireActual('node:fs');

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

function strategyFactory() {
  const calls: Array<{ browser: string; port?: number }> = [];
  const browserStrategy = (options: {
    browser: string;
    port?: number;
  }): IAuthorizationStrategy<string> => {
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
    constructed.mockClear();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const factory = (over: Partial<IAuthBrokerFactoryConfig> = {}) =>
    new AuthBrokerFactory({
      authBrokerPath: root,
      unsafe: false,
      browser: 'none',
      connectionType: 'http',
      browserStrategy: strategies.browserStrategy,
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
      expect(a).toBe(b);
      expect(constructed).toHaveBeenCalledTimes(1);
    });

    it('two concurrent first calls build one broker', async () => {
      basic('dest');
      const f = factory();
      const [a, b] = await Promise.all([
        f.getBroker('dest'),
        f.getBroker('dest'),
      ]);
      expect(a).toBe(b);
      expect(constructed).toHaveBeenCalledTimes(1);
    });

    it.each(['../../etc/x', 'a/b', '.hidden', ''])(
      'refuses the name %j before any file is touched, naming "destination"',
      async (name) => {
        const read = jest.spyOn(nodeFs, 'readFileSync');
        const exists = jest.spyOn(nodeFs, 'existsSync');
        const f = factory();
        const err = await caught(f.getBroker(name));
        expect((err as Error).message).toMatch(/^destination: /);
        expect(read).not.toHaveBeenCalled();
        expect(exists).not.toHaveBeenCalled();
        expect(constructed).not.toHaveBeenCalled();
        await expect(f.getProvider(name)).rejects.toThrow(/^destination: /);
        await expect(f.settingsFor(name)).rejects.toThrow(/^destination: /);
      },
    );

    it('(control) a valid name does read through the spied fs', async () => {
      basic('dest');
      const read = jest.spyOn(nodeFs, 'readFileSync');
      await factory().getBroker('dest');
      expect(read).toHaveBeenCalled();
    });

    it('a failed build is not cached: fixing the file lets the next call build', async () => {
      writeSession('dest', [`SAP_URL=${SYSTEM_URL}`]);
      const f = factory();
      await expect(f.getBroker('dest')).rejects.toBeInstanceOf(
        DestinationConfigError,
      );
      basic('dest');
      await expect(f.getBroker('dest')).resolves.toBeDefined();
    });
  });

  describe('the three steps', () => {
    it.each([
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
    ])('1. %s: DestinationConfigError, no broker', async (_l, lines, field) => {
      writeSession('dest', lines);
      const err = await caught(factory().getBroker('dest'));
      expect(err).toBeInstanceOf(DestinationConfigError);
      expect((err as DestinationConfigError).missingFields).toEqual([field]);
      expect((err as Error).message).not.toContain('made-up');
      expect(constructed).not.toHaveBeenCalled();
    });

    it.each([
      ['jwt', 'client_credentials'],
      ['jwt', 'passcode'],
      ['saml', 'saml2_bearer'],
    ])(
      '2. %s / %s: UnsupportedAuthenticationError, no broker, no provider',
      async (authType, grantType) => {
        writeSession('dest', [
          `SAP_URL=${SYSTEM_URL}`,
          `SAP_AUTH_TYPE=${authType}`,
          `SAP_GRANT_TYPE=${grantType}`,
        ]);
        const f = factory();
        const err = await caught(f.getBroker('dest'));
        expect(err).toBeInstanceOf(UnsupportedAuthenticationError);
        expect(err).toMatchObject({ destination: 'dest', authType, grantType });
        await expect(f.getProvider('dest')).rejects.toBeInstanceOf(
          UnsupportedAuthenticationError,
        );
        expect(constructed).not.toHaveBeenCalled();
      },
    );

    it.each(['certificate', 'kerberos'])(
      '2b. %s .env: UnsupportedAuthenticationError naming it, no broker, no value',
      async (authType) => {
        writeSession('dest', [
          `SAP_URL=${SYSTEM_URL}`,
          `SAP_AUTH_TYPE=${authType}`,
          'SAP_CERT_PATH=/made-up/secret-path',
        ]);
        const err = await caught(factory().getBroker('dest'));
        expect(err).toBeInstanceOf(UnsupportedAuthenticationError);
        expect(err).toMatchObject({ destination: 'dest', authType });
        expect((err as Error).message).toContain(authType);
        expect((err as Error).message).not.toContain('secret-path');
        expect(constructed).not.toHaveBeenCalled();
      },
    );

    it('3. basic: the broker gets exactly the stores, no option', async () => {
      basic('dest');
      await factory().getBroker('dest');
      expect(constructed).toHaveBeenCalledTimes(1);
      const config = constructed.mock.calls[0][0];
      expect(Object.keys(config).sort()).toEqual([
        'serviceKeyStore',
        'sessionStore',
      ]);
      // the destination's own stores, observed through their answers
      expect(
        (await config.serviceKeyStore.getConnectionConfig('dest'))?.authType,
      ).toBe('basic');
      expect(await config.sessionStore.loadSession('dest')).toBeNull();
    });

    it('3. jwt / none: the broker gets exactly the stores, no option', async () => {
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
      await factory({ envFile: { path: file, source: '--env' } }).getBroker(
        'default',
      );
      const config = constructed.mock.calls[0][0];
      expect(Object.keys(config).sort()).toEqual([
        'serviceKeyStore',
        'sessionStore',
      ]);
    });

    it('3. jwt / authorization_code: the stores and the browser strategy under the login lock', async () => {
      writeKey('dest', abapKey);
      await factory({ browser: 'firefox', browserAuthPort: 61005 }).getBroker(
        'dest',
      );
      const config = constructed.mock.calls[0][0];
      expect(Object.keys(config).sort()).toEqual([
        'authorization',
        'serviceKeyStore',
        'sessionStore',
      ]);
      const strategy = config.authorization('dest', 'authorization_code');
      const outcome = await strategy.authorize({
        buildAuthorizationUrl: async () => 'https://idp.example.test/authorize',
      });
      expect(outcome.payload).toBe('code-1');
      expect(strategies.calls).toEqual([{ browser: 'firefox', port: 61005 }]);
      expect(
        (await config.serviceKeyStore.getConnectionConfig('dest'))?.grantType,
      ).toBe('authorization_code');
    });
  });

  describe('settingsFor', () => {
    it('answers url, client, auth type and connection type — no secret', async () => {
      basic('dest');
      const settings = await factory().settingsFor('dest');
      expect(settings).toEqual({
        url: SYSTEM_URL,
        client: '100',
        authType: 'basic',
        connectionType: 'http',
      });
      expect(JSON.stringify(settings)).not.toContain('placeholder-password');
    });

    it('no token or refresh token of a stored jwt session', async () => {
      const file = path.join(root, 'conn.env');
      fs.writeFileSync(
        file,
        [
          `SAP_URL=${SYSTEM_URL}`,
          'SAP_AUTH_TYPE=jwt',
          'SAP_GRANT_TYPE=none',
          'SAP_JWT_TOKEN=placeholder-token',
          'SAP_REFRESH_TOKEN=placeholder-refresh',
        ].join('\n'),
      );
      const settings = await factory({
        envFile: { path: file, source: '--env' },
      }).settingsFor('default');
      expect(settings).toEqual({
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
      expect(await f.settingsFor('dest')).toEqual(first);
      expect(first.url).toBe(SYSTEM_URL);
      expect(first.client).toBe('100');
    });

    it('XSUAA_MCP_URL is read once too', async () => {
      writeKey('dest', xsuaaKey('https://tenant.example.test'));
      writeSession('dest', [`XSUAA_MCP_URL=${XSUAA_SYSTEM_URL}`]);
      const f = factory();
      await f.settingsFor('dest');
      writeSession('dest', ['XSUAA_MCP_URL=https://changed.example.test']);
      expect((await f.settingsFor('dest')).url).toBe(XSUAA_SYSTEM_URL);
    });

    it('a failed read is not cached: fixing the file lets the next call answer', async () => {
      writeKey('dest', xsuaaKey('https://tenant.example.test'));
      const f = factory();
      await expect(f.settingsFor('dest')).rejects.toBeInstanceOf(
        DestinationConfigError,
      );
      writeSession('dest', [`XSUAA_MCP_URL=${XSUAA_SYSTEM_URL}`]);
      expect((await f.settingsFor('dest')).url).toBe(XSUAA_SYSTEM_URL);
    });

    it('no URL: DestinationConfigError naming SAP_URL', async () => {
      writeSession('dest', ['SAP_AUTH_TYPE=basic', 'SAP_USERNAME=u']);
      const err = await caught(factory().settingsFor('dest'));
      expect(err).toBeInstanceOf(DestinationConfigError);
      expect((err as DestinationConfigError).missingFields).toEqual([
        'SAP_URL',
      ]);
    });

    const keyUrls = [
      ['a UAA url', 'https://tenant.authentication.example.test'],
      ['a url without "authentication"', 'https://tenant.example.test'],
    ] as const;

    it.each(keyUrls)(
      'XSUAA key with %s: the URL is XSUAA_MCP_URL',
      async (_l, keyUrl) => {
        writeKey('dest', xsuaaKey(keyUrl));
        writeSession('dest', [`XSUAA_MCP_URL=${XSUAA_SYSTEM_URL}`]);
        const settings = await factory().settingsFor('dest');
        expect(settings.url).toBe(XSUAA_SYSTEM_URL);
        expect(settings.authType).toBe('jwt');
      },
    );

    it.each(keyUrls)(
      'XSUAA key with %s and SAP_URL instead: refused naming XSUAA_MCP_URL',
      async (_l, keyUrl) => {
        writeKey('dest', xsuaaKey(keyUrl));
        writeSession('dest', [`SAP_URL=${SYSTEM_URL}`]);
        const err = await caught(factory().settingsFor('dest'));
        expect(err).toBeInstanceOf(DestinationConfigError);
        expect((err as DestinationConfigError).missingFields).toEqual([
          'XSUAA_MCP_URL',
        ]);
      },
    );

    it.each(keyUrls)(
      'XSUAA key with %s and no session file: refused naming XSUAA_MCP_URL',
      async (_l, keyUrl) => {
        writeKey('dest', xsuaaKey(keyUrl));
        const err = await caught(factory().settingsFor('dest'));
        expect((err as DestinationConfigError).missingFields).toEqual([
          'XSUAA_MCP_URL',
        ]);
      },
    );

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
      expect(err).toBeInstanceOf(DestinationConfigError);
      expect((err as DestinationConfigError).missingFields).toEqual([
        'connection-type',
      ]);
    });

    it('SNC over rfc: accepted', async () => {
      snc();
      await expect(
        factory({ connectionType: 'rfc' }).settingsFor('dest'),
      ).resolves.toEqual({
        url: SYSTEM_URL,
        authType: 'snc',
        connectionType: 'rfc',
      });
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
      await expect(f.systemContextFor('dest')).resolves.toEqual({
        responsible: 'responsible-of-dest',
        login: 'placeholder-user',
        masterSystem: 'system-of-dest',
      });
      // SAP_RESPONSIBLE unset: no responsible; the login is a fallback the
      // request resolves after every SAP_RESPONSIBLE (process included).
      await expect(f.systemContextFor('other')).resolves.toEqual({
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
          'SAP_AUTH_TYPE=jwt',
          'SAP_GRANT_TYPE=none',
          'SAP_JWT_TOKEN=placeholder-token',
          'SAP_MASTER_SYSTEM=system-of-file',
        ].join('\n'),
      );
      await expect(
        factory({
          envFile: { path: file, source: '--env' },
        }).systemContextFor('default'),
      ).resolves.toEqual({ masterSystem: 'system-of-file' });
    });

    it('a destination that states neither answers nothing — the process environment is not read here', async () => {
      const saved = process.env.SAP_MASTER_SYSTEM;
      process.env.SAP_MASTER_SYSTEM = 'system-of-process';
      try {
        writeKey('dest', abapKey);
        await expect(factory().systemContextFor('dest')).resolves.toEqual({});
      } finally {
        if (saved === undefined) delete process.env.SAP_MASTER_SYSTEM;
        else process.env.SAP_MASTER_SYSTEM = saved;
      }
    });

    it('a name that is a path is refused before any file is read', async () => {
      await expect(factory().systemContextFor('../x')).rejects.toThrow(
        /^destination: /,
      );
    });
  });

  describe('getProvider', () => {
    it('a named jwt / none destination without --unsafe: lacks authorizationToken, with the hint', async () => {
      writeSession('dest', [
        `SAP_URL=${SYSTEM_URL}`,
        'SAP_AUTH_TYPE=jwt',
        'SAP_GRANT_TYPE=none',
        'SAP_JWT_TOKEN=placeholder-token',
      ]);
      const err = await caught(factory({ unsafe: false }).getProvider('dest'));
      expect(err).toBeInstanceOf(DestinationConfigError);
      const text = describeAuthError(err);
      expect(text).toContain('Destination "dest" lacks: authorizationToken');
      expect(text).toContain('is read only with --unsafe');
      expect(text).not.toContain('placeholder-token');
    });

    it('the same counted object for every call on a destination', async () => {
      basic('dest');
      const f = factory();
      const [a, b] = await Promise.all([
        f.getProvider('dest'),
        f.getProvider('dest'),
      ]);
      const c = await f.getProvider('dest');
      expect(a).toBe(b);
      expect(a).toBe(c);
      const inner = await (await f.getBroker('dest')).getProvider('dest');
      expect(a).not.toBe(inner);
      expect(a.kind).toBe(inner.kind);
    });
  });

  describe('settle', () => {
    async function withHeld(f: AuthBrokerFactory, name: string) {
      const broker = await f.getBroker(name);
      const held = heldInner();
      jest.spyOn(broker, 'getProvider').mockResolvedValue(held.inner);
      return { broker, ...held };
    }

    it('closes the gate before waiting: a provider handed out after settle starts answers the shutdown refusal', async () => {
      basic('dest');
      basic('other');
      const f = factory();
      const { calls, release } = await withHeld(f, 'dest');
      const p = await f.getProvider('dest');
      const running = p.rejected(REJECTION_401);
      const settling = f.settle(30_000);
      const later = await f.getProvider('other');
      await expect(later.prepare()).resolves.toEqual(SHUTDOWN_REFUSAL);
      await expect(p.authorize({} as never)).resolves.toEqual(SHUTDOWN_REFUSAL);
      expect(calls).toEqual(['rejected']);
      release();
      await running;
      await expect(settling).resolves.toEqual({ abandoned: 0, notStored: [] });
    });

    it('waits for a held call, then flushes every broker built, once each', async () => {
      basic('dest');
      basic('other');
      const f = factory();
      const events: string[] = [];
      const { broker, release } = await withHeld(f, 'dest');
      const other = await f.getBroker('other');
      for (const [name, b] of [
        ['dest', broker],
        ['other', other],
      ] as Array<[string, AuthBroker]>) {
        jest.spyOn(b, 'flush').mockImplementation(async () => {
          events.push(`flush ${name}`);
        });
      }
      const p = await f.getProvider('dest');
      const running = p.rejected(REJECTION_401).then((o) => {
        events.push('answered');
        return o;
      });
      const settling = f.settle(30_000);
      await tick();
      await tick();
      expect(events).toEqual([]);
      release();
      await running;
      await expect(settling).resolves.toEqual({ abandoned: 0, notStored: [] });
      expect(events[0]).toBe('answered');
      expect(events.slice(1).sort()).toEqual(['flush dest', 'flush other']);
      expect(broker.flush).toHaveBeenCalledTimes(1);
      expect(other.flush).toHaveBeenCalledTimes(1);
    });

    it('reports the calls still running at the deadline as abandoned', async () => {
      basic('dest');
      const f = factory();
      const { broker, release } = await withHeld(f, 'dest');
      const flush = jest.spyOn(broker, 'flush');
      const p = await f.getProvider('dest');
      const running = p.prepare();
      await expect(f.settle(50)).resolves.toEqual({
        abandoned: 1,
        notStored: [],
      });
      expect(flush).toHaveBeenCalledTimes(1);
      release();
      await running;
    });

    it('reports a rejecting flush() as destination and class only', async () => {
      basic('dest');
      basic('other');
      const f = factory();
      const a = await f.getBroker('dest');
      const b = await f.getBroker('other');
      jest
        .spyOn(a, 'flush')
        .mockRejectedValue(
          new AggregateError(
            [new Error('"dest": StorageError')],
            'Session writes still failing for "dest" placeholder-secret',
          ),
        );
      class OddStoreFailure extends Error {}
      jest
        .spyOn(b, 'flush')
        .mockRejectedValue(new OddStoreFailure('placeholder-secret'));
      const report = await f.settle(1_000);
      expect(report.abandoned).toBe(0);
      expect(report.notStored.sort()).toEqual([
        '"dest": StorageError',
        '"other": OddStoreFailure',
      ]);
      expect(JSON.stringify(report)).not.toContain('placeholder-secret');
    });
  });

  describe('defaultDestination', () => {
    it('--mcp=X → X', () => {
      expect(factory({ mcpDestination: 'dest' }).defaultDestination).toBe(
        'dest',
      );
    });
    it('an env file → default', () => {
      expect(
        factory({
          envFile: { path: path.join(root, 'conn.env'), source: '--env' },
        }).defaultDestination,
      ).toBe('default');
    });
    it('neither → undefined', () => {
      expect(factory().defaultDestination).toBeUndefined();
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
      expect((err as Error).message).toBe(
        `--env-path: the file does not exist: ${missing}`,
      );
    });

    it('a named destination beside it reads its own stores', async () => {
      const file = path.join(root, 'conn.env');
      fs.writeFileSync(file, `SAP_URL=${SYSTEM_URL}\nSAP_AUTH_TYPE=basic\n`);
      basic('dest');
      const f = factory({ envFile: { path: file, source: '--env' } });
      expect((await f.settingsFor('dest')).client).toBe('100');
      expect((await f.settingsFor('default')).client).toBeUndefined();
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

    beforeAll(() => {
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
      await expect(provider.prepare()).resolves.toEqual(OK);
      expect(fs.readFileSync(envFile, 'utf8')).toContain(ACCESS_1);
      const answered = provider.rejected(REJECTION_401);
      await refreshArrived.promise;
      return { provider, answered };
    }

    it('a refresh held while settle(30_000) runs: it answers, its token is stored, abandoned 0', async () => {
      const f = factory({ envFile: { path: envFile, source: '--env' } });
      const { answered } = await refreshing(f);
      let settled = false;
      const settling = f.settle(30_000).then((r) => {
        settled = true;
        return r;
      });
      await tick();
      await tick();
      expect(settled).toBe(false);
      releaseRefresh();
      await expect(answered).resolves.toEqual(OK);
      await expect(settling).resolves.toEqual({ abandoned: 0, notStored: [] });
      const stored = fs.readFileSync(envFile, 'utf8');
      expect(stored).toContain(`SAP_JWT_TOKEN=${ACCESS_2}`);
      expect(stored).toContain('SAP_REFRESH_TOKEN=placeholder-refresh-2');
      expect(tokenRequests).toEqual(['authorization_code', 'refresh_token']);
    });

    it('a refresh held past a short deadline: abandoned 1', async () => {
      const f = factory({ envFile: { path: envFile, source: '--env' } });
      const { answered } = await refreshing(f);
      await expect(f.settle(50)).resolves.toEqual({
        abandoned: 1,
        notStored: [],
      });
      releaseRefresh();
      await answered;
    });

    it('a 401 after settle began: the shutdown refusal, the inner provider never called, nothing written after the flush', async () => {
      const f = factory({ envFile: { path: envFile, source: '--env' } });
      const { provider, answered } = await refreshing(f);
      const broker = await f.getBroker('default');
      const inner = await broker.getProvider('default');
      const innerRejected = jest.spyOn(inner, 'rejected');
      const flush = jest.spyOn(broker, 'flush');

      const settling = f.settle(30_000);
      // A request on the wire comes back 401 while settle waits. Raced
      // against a timer: forwarded, it would join the held refresh and wait.
      const verdict = await Promise.race([
        provider.rejected(REJECTION_401),
        new Promise((r) => setTimeout(() => r('still waiting'), 1_000)),
      ]);
      expect(verdict).toEqual(SHUTDOWN_REFUSAL);
      expect(innerRejected).not.toHaveBeenCalled();

      releaseRefresh();
      await answered;
      await settling;
      expect(flush).toHaveBeenCalledTimes(1);
      const afterFlush = fs.readFileSync(envFile, 'utf8');

      // And after settle: still refused, still not forwarded.
      await expect(provider.rejected(REJECTION_401)).resolves.toEqual(
        SHUTDOWN_REFUSAL,
      );
      await new Promise((r) => setTimeout(r, 100));
      expect(innerRejected).not.toHaveBeenCalled();
      expect(tokenRequests).toEqual(['authorization_code', 'refresh_token']);
      expect(fs.readFileSync(envFile, 'utf8')).toBe(afterFlush);
    });
  });
});

describe('describeAuthError', () => {
  const HINTS = {
    grantType:
      'Regenerate the destination with `mcp-auth generate-env --grant <grant>` (from @mcp-abap-adt/auth-broker-cli).',
    SAP_URL: "Set SAP_URL to the system's URL.",
    XSUAA_MCP_URL:
      "Set XSUAA_MCP_URL in the destination's sessions/<destination>.env to the system's URL.",
    'connection-type': 'SNC logs on over RFC: set --connection-type=rfc.',
    authorizationToken:
      'A token in sessions/<destination>.env is read only with --unsafe: start with --unsafe, or serve the file with --env=<destination> or --env-path.',
  } as const;

  it.each(Object.keys(HINTS) as Array<keyof typeof HINTS>)(
    'names %s with its own hint and no other',
    (field) => {
      const text = describeAuthError(
        new DestinationConfigError('dest', [field], 'fixed reason'),
      );
      expect(text).toBe(`Destination "dest" lacks: ${field}\n${HINTS[field]}`);
      for (const [other, hint] of Object.entries(HINTS)) {
        if (other !== field) expect(text).not.toContain(hint);
      }
    },
  );

  it('a field without a known remedy gets the bare lacks line', () => {
    expect(
      describeAuthError(
        new DestinationConfigError('dest', ['uaaClientId'], 'fixed reason'),
      ),
    ).toBe('Destination "dest" lacks: uaaClientId');
  });

  it('several fields: one line naming them, then a hint per known field', () => {
    expect(
      describeAuthError(
        new DestinationConfigError(
          'dest',
          ['uaaUrl', 'grantType'],
          'fixed reason',
        ),
      ),
    ).toBe(`Destination "dest" lacks: uaaUrl, grantType\n${HINTS.grantType}`);
  });

  it('carries no value read from a store', () => {
    let err: unknown;
    try {
      vetMeans('dest', {
        authType: 'jwt',
        grantType: 'made-up-grant-z9' as never,
      });
    } catch (e) {
      err = e;
    }
    const text = describeAuthError(err);
    expect(text).toContain('Destination "dest" lacks: grantType');
    expect(text).not.toContain('made-up-grant-z9');
    try {
      vetMeans('dest', { authType: 'made-up-type-z9' as never });
    } catch (e) {
      err = e;
    }
    expect(describeAuthError(err)).toBe('Destination "dest" lacks: authType');
  });

  it('an unsupported authentication', () => {
    expect(
      describeAuthError(
        new UnsupportedAuthenticationError('dest', 'jwt', 'client_credentials'),
      ),
    ).toBe(
      'Destination "dest" uses jwt / client_credentials, which this server does not support',
    );
  });

  it('anything else: undefined', () => {
    expect(describeAuthError(new Error('x'))).toBeUndefined();
    expect(describeAuthError('x')).toBeUndefined();
  });
});
