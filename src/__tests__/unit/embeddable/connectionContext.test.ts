/**
 * A server's connection context holds settings and a credential, each from
 * its one source: a destination's settings and `getProvider` (H0), or the
 * request headers through `credentialFromHeaders`. No token is read, no
 * refresher is looked up, and the settings carry no secret.
 */

import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';

jest.mock('../../../lib/connectionFactory', () => ({
  createAbapConnection: jest.fn(),
}));
jest.mock('../../../lib/systemContext', () => {
  const actual = jest.requireActual('../../../lib/systemContext');
  return { ...actual, resolveSystemContext: jest.fn() };
});
jest.mock('../../../lib/credentialSources', () => {
  const actual = jest.requireActual('../../../lib/credentialSources');
  return {
    ...actual,
    credentialFromHeaders: jest.fn(actual.credentialFromHeaders),
  };
});

import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import type { ConnectionContext } from '../../../embeddable/ConnectionContext';
import type { IDestinations } from '../../../lib/auth';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { credentialFromHeaders } from '../../../lib/credentialSources';
import { resolveSystemContext } from '../../../lib/systemContext';

const build = createAbapConnection as jest.MockedFunction<
  typeof createAbapConnection
>;
const resolve = resolveSystemContext as jest.MockedFunction<
  typeof resolveSystemContext
>;
const fromHeaders = credentialFromHeaders as jest.MockedFunction<
  typeof credentialFromHeaders
>;

/** Every field of a SapConfig that carries a secret. */
const SECRET_FIELDS = [
  'username',
  'password',
  'jwtToken',
  'refreshToken',
  'uaaClientSecret',
  'sessionCookies',
  'certPassphrase',
] as const;

const silent = { info() {}, debug() {}, warn() {}, error() {} };

class TestServer extends BaseMcpServer {
  constructor() {
    super({ name: 'test-server', version: '1.0.0', logger: silent });
  }
  context(): ConnectionContext | null {
    return this.getConnectionContext();
  }
  fromDestination(destination: string, destinations: IDestinations) {
    return this.setConnectionContext(destination, destinations);
  }
  fromHeaders(headers: Record<string, string | string[] | undefined>) {
    this.setConnectionContextFromHeaders(headers);
  }
  connection() {
    return this.getConnection();
  }
}

function fakeProvider(): IAuthProvider {
  return {
    kind: 'test',
    prepare: jest.fn(async () => ({ ok: true as const })),
    establish: jest.fn(async () => ({ ok: true as const })),
    authorize: jest.fn(async () => ({ ok: true as const })),
    rejected: jest.fn(async () => ({ ok: true as const })),
  };
}

function fakeConnection() {
  return { connect: jest.fn(async () => {}) } as any;
}

const SETTINGS: SapConfig = {
  url: 'https://system.example.invalid',
  authType: 'jwt',
};

/** An IDestinations with nothing but its two methods. */
function stubDestinations(provider: IAuthProvider) {
  const destinations = {
    settingsFor: jest.fn(async () => ({ ...SETTINGS })),
    getProvider: jest.fn(async () => provider),
  };
  return destinations;
}

beforeEach(() => {
  build.mockReset();
  build.mockImplementation(() => fakeConnection());
  resolve.mockReset();
  resolve.mockResolvedValue({
    masterSystem: 'master-placeholder',
    responsible: 'responsible-placeholder',
    client: '000',
  });
  fromHeaders.mockClear();
});

describe('setConnectionContext(destination, destinations)', () => {
  it('holds the provider getProvider gave, and settings with no secret', async () => {
    const provider = fakeProvider();
    const destinations = stubDestinations(provider);
    // Nothing else on the stub: no getToken, no createTokenRefresher.
    expect(Object.keys(destinations).sort()).toEqual([
      'getProvider',
      'settingsFor',
    ]);

    const server = new TestServer();
    await server.fromDestination('dest-a', destinations);

    const context = server.context();
    expect(context?.credential).toBe(provider);
    expect(destinations.settingsFor).toHaveBeenCalledWith('dest-a');
    expect(destinations.getProvider).toHaveBeenCalledWith('dest-a');
    expect(context?.connectionParams.url).toBe(SETTINGS.url);
    expect(context?.connectionParams.authType).toBe('jwt');
    for (const field of SECRET_FIELDS) {
      expect(context?.connectionParams).not.toHaveProperty(field);
    }
    expect(context?.sessionId).toBe('dest-a');
    expect(context?.metadata).toEqual({ destination: 'dest-a' });
  });

  it('builds no connection and looks nothing up: no setup-time master-system lookup', async () => {
    const provider = fakeProvider();
    const server = new TestServer();
    await server.fromDestination('dest-a', stubDestinations(provider));

    expect(build).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
    expect(provider.prepare).not.toHaveBeenCalled();
  });

  it('a client the settings do not state stays unstated (the system default applies)', async () => {
    const server = new TestServer();
    await server.fromDestination('dest-a', stubDestinations(fakeProvider()));
    expect(server.context()?.connectionParams.client).toBeUndefined();
  });

  it('a destination that fails reaches the caller as the error it is', async () => {
    const failure = new Error('destination refused');
    const destinations = {
      settingsFor: jest.fn(async () => {
        throw failure;
      }),
      getProvider: jest.fn(async () => fakeProvider()),
    };
    const server = new TestServer();
    await expect(server.fromDestination('dest-a', destinations)).rejects.toBe(
      failure,
    );
    expect(server.context()).toBeNull();
  });
});

describe('getConnection()', () => {
  it('builds the connector with the context credential and connects it', async () => {
    const provider = fakeProvider();
    const server = new TestServer();
    await server.fromDestination('dest-a', stubDestinations(provider));
    build.mockClear();

    const connection = await server.connection();

    expect(build).toHaveBeenCalledTimes(1);
    const [settings, credential] = build.mock.calls[0];
    expect(credential).toBe(provider);
    expect(settings).toBe(server.context()?.connectionParams);
    expect((connection as any).connect).toHaveBeenCalledTimes(1);
  });

  it('stdio: one context reuses one connection', async () => {
    const server = new TestServer();
    await server.fromDestination('dest-a', stubDestinations(fakeProvider()));
    build.mockClear();

    const first = await server.connection();
    const second = await server.connection();

    expect(second).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('HTTP: a second context builds a new connection with the same credential object', async () => {
    const provider = fakeProvider();
    const destinations = stubDestinations(provider);
    const one = new TestServer();
    const two = new TestServer();
    await one.fromDestination('dest-a', destinations);
    await two.fromDestination('dest-a', destinations);
    build.mockClear();

    const a = await one.connection();
    const b = await two.connection();

    expect(b).not.toBe(a);
    expect(build).toHaveBeenCalledTimes(2);
    expect(build.mock.calls[0][1]).toBe(provider);
    expect(build.mock.calls[1][1]).toBe(provider);
  });

  it('without a context it refuses', async () => {
    await expect(new TestServer().connection()).rejects.toThrow(
      /Connection context not set/,
    );
  });
});

describe('setConnectionContextFromHeaders(headers)', () => {
  it('a token header: the context is what credentialFromHeaders answered', async () => {
    const headers = {
      'x-sap-url': 'https://system.example.invalid',
      'x-sap-jwt-token': 'token-placeholder',
      'x-sap-client': '000',
      'x-sap-master-system': 'master-placeholder',
    };
    const server = new TestServer();
    server.fromHeaders(headers);

    expect(fromHeaders).toHaveBeenCalledWith(headers);
    const answered = fromHeaders.mock.results[0].value;
    const context = server.context();
    expect(context?.credential).toBe(answered.credential);
    expect(context?.connectionParams).toEqual(answered.settings);
    expect(context?.connectionParams.authType).toBe('jwt');
    expect(context?.sessionId).toBe('direct-jwt');
    expect(context?.metadata).toMatchObject({
      masterSystem: 'master-placeholder',
    });
    for (const field of SECRET_FIELDS) {
      expect(context?.connectionParams).not.toHaveProperty(field);
    }

    await server.connection();
    expect(build.mock.calls[0][1]).toBe(answered.credential);
  });

  it('a user and password: basic, the secret in the credential only', () => {
    const server = new TestServer();
    server.fromHeaders({
      'x-sap-url': 'https://system.example.invalid',
      'x-sap-login': 'user-placeholder',
      'x-sap-password': 'password-placeholder',
    });
    const context = server.context();
    expect(context?.connectionParams.authType).toBe('basic');
    expect(context?.sessionId).toBe('direct-basic');
    expect(JSON.stringify(context?.connectionParams)).not.toContain(
      'password-placeholder',
    );
    expect(context?.credential).toBe(
      fromHeaders.mock.results[0].value.credential,
    );
  });

  it('neither: refused as before', () => {
    expect(() =>
      new TestServer().fromHeaders({
        'x-sap-url': 'https://system.example.invalid',
      }),
    ).toThrow(/x-sap-jwt-token or x-sap-login\+x-sap-password/);
  });
});
