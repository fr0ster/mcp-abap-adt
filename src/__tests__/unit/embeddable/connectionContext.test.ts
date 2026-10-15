/**
 * A server's connection context is its source: a destination's
 * settings and `getProvider` (core), or the request headers through
 * `headerSource` (http, sse). No token is read, no refresher is looked up,
 * and the settings carry no secret. A connection is kept while the source
 * answers the same credential object and built anew for a new one.
 */

import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';

jest.mock('../../../lib/connectionFactory', () => ({
  createAbapConnection: jest.fn(),
  // The connect's system lookup reads the kind for a 404: on-premise, the
  // configuration applies.
  systemKindOf: jest.fn(() => 'onprem'),
}));
jest.mock('../../../lib/systemInformation', () => ({
  ...jest.requireActual('../../../lib/systemInformation'),
  readSystemInformation: jest.fn(),
}));
jest.mock('../../../lib/credentialSources', () => {
  const actual = jest.requireActual('../../../lib/credentialSources');
  return {
    ...actual,
    credentialFromHeaders: jest.fn(actual.credentialFromHeaders),
  };
});

import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import type {
  ConnectionContext,
  ConnectionSource,
  ResolvedConnection,
} from '../../../embeddable/ConnectionContext';
import type { DestinationSystemContext } from '../../../lib/auth';
import { serverRefusalOf } from '../../../lib/auth/serverRefusal';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { credentialFromHeaders } from '../../../lib/credentialSources';
import type { HandlerEntry } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { headerContext } from '../../../lib/httpTransport/headerSource';
import {
  getStatedSystemContext,
  getSystemContext,
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import { readSystemInformation } from '../../../lib/systemInformation';

const build = createAbapConnection as jest.MockedFunction<
  typeof createAbapConnection
>;
const lookup = readSystemInformation as jest.Mock;
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

/** One tool that answers the responsible and master system its call sees. */
const reportingRegistry = new CompositeHandlersRegistry([
  {
    getName: () => 'reporting',
    registerHandlers: () => {},
    getHandlers: (): HandlerEntry[] => [
      {
        toolDefinition: { name: 'Report', description: 'd' } as never,
        handler: (async () => {
          const seen = getStatedSystemContext();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  responsible: seen.responsible ?? null,
                  masterSystem: seen.masterSystem ?? null,
                }),
              },
            ],
          };
        }) as never,
      },
    ],
  },
]);

class TestServer extends BaseMcpServer {
  constructor() {
    super({ name: 'test-server', version: '1.0.0', logger: silent });
    this.registerHandlers(reportingRegistry);
  }
  async report(): Promise<unknown> {
    const tools = (
      this as unknown as {
        _registeredTools: Record<
          string,
          { handler: (a: unknown) => Promise<{ content: { text: string }[] }> }
        >;
      }
    )._registeredTools;
    const result = await tools.Report.handler({});
    return JSON.parse(result.content[0].text);
  }
  context(): ConnectionContext | null {
    return this.getConnectionContext();
  }
  fromSource(source: ConnectionSource) {
    this.setConnectionContext({ kind: 'built', source, sessionId: 'dest-a' });
  }
  fromHeaders(headers: Record<string, string | string[] | undefined>) {
    this.setConnectionContext(headerContext(headers));
  }
  connection() {
    return this.getConnection(new AbortController().signal);
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

/** A destination-like source: the settings, the provider, what its .env states. */
function sourceOf(
  provider: IAuthProvider,
  systemContext?: DestinationSystemContext,
) {
  const resolve = jest.fn(
    async (_signal: AbortSignal): Promise<ResolvedConnection> => ({
      settings: { ...SETTINGS },
      credential: provider,
      ...(systemContext ? { systemContext } : {}),
    }),
  );
  return { resolve } satisfies ConnectionSource;
}

/** A source answering each provider in turn, then the last one. */
function sourceAnswering(...providers: IAuthProvider[]): ConnectionSource {
  let call = 0;
  return {
    resolve: async () => ({
      settings: { ...SETTINGS },
      credential: providers[Math.min(call++, providers.length - 1)],
    }),
  };
}

beforeEach(() => {
  build.mockReset();
  build.mockImplementation(() => fakeConnection());
  lookup.mockReset();
  // An on-premise system without the function: the configuration applies.
  lookup.mockRejectedValue(
    Object.assign(new Error('placeholder'), { response: { status: 404 } }),
  );
  fromHeaders.mockClear();
});

describe('setConnectionContext({ kind: built, source })', () => {
  it('builds no connection, resolves nothing and looks nothing up', async () => {
    const provider = fakeProvider();
    const source = sourceOf(provider);
    const server = new TestServer();
    server.fromSource(source);

    expect(source.resolve).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
    expect(provider.prepare).not.toHaveBeenCalled();
  });

  it('the master system and responsible from configuration reach the context, with no connection', async () => {
    const saved = { ...process.env };
    try {
      resetSystemContextCache();
      process.env.SAP_MASTER_SYSTEM = 'SYSTEM_FROM_CONFIG';
      process.env.SAP_RESPONSIBLE = 'USER_FROM_CONFIG';
      const server = new TestServer();
      server.fromSource(sourceOf(fakeProvider()));
      expect(getSystemContext()).toMatchObject({
        masterSystem: 'SYSTEM_FROM_CONFIG',
        responsible: 'USER_FROM_CONFIG',
      });
      expect(build).not.toHaveBeenCalled();
    } finally {
      process.env = saved;
      resetSystemContextCache();
    }
  });

  it("stdio (no request scope): the source's own statement wins over the process configuration, key by key", async () => {
    const saved = { ...process.env };
    try {
      resetSystemContextCache();
      process.env.SAP_MASTER_SYSTEM = 'SYSTEM_FROM_PROCESS';
      process.env.SAP_RESPONSIBLE = 'USER_FROM_PROCESS';
      const server = new TestServer();
      server.fromSource(
        // The login states the user an on-premise system without the
        // function needs; the stated responsible wins over it.
        sourceOf(fakeProvider(), {
          responsible: 'USER_OF_DESTINATION',
          login: 'LOGIN_OF_DESTINATION',
        }),
      );
      await expect(server.report()).resolves.toEqual({
        responsible: 'USER_OF_DESTINATION',
        masterSystem: 'SYSTEM_FROM_PROCESS',
      });
    } finally {
      process.env = saved;
      resetSystemContextCache();
    }
  });
});

describe('getConnection(signal)', () => {
  it('builds the connector with the resolved settings and credential and connects it', async () => {
    const provider = fakeProvider();
    const server = new TestServer();
    server.fromSource(sourceOf(provider));

    const connection = await server.connection();

    expect(build).toHaveBeenCalledTimes(1);
    const [settings, credential] = build.mock.calls[0];
    expect(credential).toBe(provider);
    expect(settings).toEqual(SETTINGS);
    for (const field of SECRET_FIELDS) {
      expect(settings).not.toHaveProperty(field);
    }
    expect((connection as any).connect).toHaveBeenCalledTimes(1);
  });

  it('the same credential object: one connection, resolved per call', async () => {
    const source = sourceOf(fakeProvider());
    const server = new TestServer();
    server.fromSource(source);

    const first = await server.connection();
    const second = await server.connection();

    expect(second).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
    expect(source.resolve).toHaveBeenCalledTimes(2);
  });

  it('a new credential object: a new connection, built with it', async () => {
    const one = fakeProvider();
    const two = fakeProvider();
    const server = new TestServer();
    server.fromSource(sourceAnswering(one, two));

    const a = await server.connection();
    const b = await server.connection();

    expect(b).not.toBe(a);
    expect(build).toHaveBeenCalledTimes(2);
    expect(build.mock.calls[0][1]).toBe(one);
    expect(build.mock.calls[1][1]).toBe(two);
  });

  it('a failed connect is not kept: the next call connects again', async () => {
    const failing = {
      connect: jest.fn(async () => Promise.reject(new Error('down'))),
    };
    build.mockImplementationOnce(() => failing as any);
    const server = new TestServer();
    server.fromSource(sourceOf(fakeProvider()));

    await expect(server.connection()).rejects.toThrow('down');
    const connection = await server.connection();
    expect(connection).not.toBe(failing);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('a source that fails reaches the caller as the error it is', async () => {
    const failure = new Error('destination refused');
    const server = new TestServer();
    server.fromSource({
      resolve: async () => {
        throw failure;
      },
    });
    await expect(server.connection()).rejects.toBe(failure);
    expect(build).not.toHaveBeenCalled();
  });

  it('without a context it refuses', async () => {
    await expect(new TestServer().connection()).rejects.toThrow(
      /Connection context not set/,
    );
  });
});

describe("an embedder's setSystemContext survives a request", () => {
  it.each(['destination', 'headers'] as const)(
    'setting the context up from %s fills only what the embedder left unset',
    async (from) => {
      const saved = { ...process.env };
      try {
        resetSystemContextCache();
        setSystemContext({ masterSystem: 'SYSTEM_OF_EMBEDDER' });
        process.env.SAP_MASTER_SYSTEM = 'SYSTEM_FROM_PROCESS';
        process.env.SAP_RESPONSIBLE = 'USER_FROM_PROCESS';
        const server = new TestServer();
        if (from === 'destination') {
          server.fromSource(sourceOf(fakeProvider()));
        } else {
          server.fromHeaders({
            'x-sap-url': 'https://system.example.invalid',
            'x-sap-jwt-token': 'token-placeholder',
          });
        }
        expect(getSystemContext()).toMatchObject({
          masterSystem: 'SYSTEM_OF_EMBEDDER',
          responsible: 'USER_FROM_PROCESS',
        });
      } finally {
        process.env = saved;
        resetSystemContextCache();
      }
    },
  );
});

describe('headerContext(headers): the x-sap-* headers as the source', () => {
  it('reads the process configuration: no destination, so it is the fallback', async () => {
    const saved = { ...process.env };
    try {
      resetSystemContextCache();
      process.env.SAP_MASTER_SYSTEM = 'SYSTEM_FROM_PROCESS';
      process.env.SAP_RESPONSIBLE = 'USER_FROM_PROCESS';
      const server = new TestServer();
      server.fromHeaders({
        'x-sap-url': 'https://system.example.invalid',
        'x-sap-jwt-token': 'token-placeholder',
      });
      expect(getSystemContext()).toMatchObject({
        masterSystem: 'SYSTEM_FROM_PROCESS',
        responsible: 'USER_FROM_PROCESS',
      });
    } finally {
      process.env = saved;
      resetSystemContextCache();
    }
  });

  it('a token header: the connection is built from what credentialFromHeaders answered', async () => {
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
    expect(context?.kind).toBe('built');
    expect(context?.sessionId).toBe('direct-jwt');
    expect(context?.metadata).toMatchObject({
      masterSystem: 'master-placeholder',
    });

    await server.connection();
    const [settings, credential] = build.mock.calls[0];
    expect(credential).toBe(answered.credential);
    expect(settings).toEqual(answered.settings);
    expect(settings.authType).toBe('jwt');
    for (const field of SECRET_FIELDS) {
      expect(settings).not.toHaveProperty(field);
    }
  });

  it('a user and password: basic, the secret in the credential only', async () => {
    const server = new TestServer();
    server.fromHeaders({
      'x-sap-url': 'https://system.example.invalid',
      'x-sap-login': 'user-placeholder',
      'x-sap-password': 'password-placeholder',
    });
    expect(server.context()?.sessionId).toBe('direct-basic');
    await server.connection();
    const [settings, credential] = build.mock.calls[0];
    expect(settings.authType).toBe('basic');
    expect(JSON.stringify(settings)).not.toContain('password-placeholder');
    expect(credential).toBe(fromHeaders.mock.results[0].value.credential);
  });

  it('neither: refused credentials_required, before any credential is built', () => {
    let thrown: unknown;
    try {
      new TestServer().fromHeaders({
        'x-sap-url': 'https://system.example.invalid',
      });
    } catch (error) {
      thrown = error;
    }
    expect(serverRefusalOf(thrown)?.code).toBe('credentials_required');
    expect(fromHeaders).not.toHaveBeenCalled();
  });
});
