/**
 * A server's connection context is its source: a destination's
 * settings and `getProvider` (core), or the request headers through
 * `headerSource` (http, sse). No token is read, no refresher is looked up,
 * and the settings carry no secret. A connection is built once and kept:
 * it presents the credential the source answers (`CurrentCredential`), a
 * new credential object put in force on it.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import type {
  ConnectionContext,
  ConnectionSource,
  ResolvedConnection,
} from '../../../embeddable/ConnectionContext';
import type { DestinationSystemContext } from '../../../lib/auth';
import { serverRefusalOf } from '../../../lib/auth/serverRefusal';
import * as connectionFactory from '../../../lib/connectionFactory';
import * as credentialSources from '../../../lib/credentialSources';
import type { HandlerEntry } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { headerContext } from '../../../lib/httpTransport/headerSource';
import {
  getStatedSystemContext,
  getSystemContext,
  resetSystemContextCache,
} from '../../../lib/systemContext';
import * as systemInformation from '../../../lib/systemInformation';
import {
  assertMatchObject,
  assertNoProperty,
  assertRejects,
  rejectionOf,
} from '../../helpers/assertions';
import { presented } from '../../helpers/presented';
import { setSystemContext } from '../../helpers/processSystemContext';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

/**
 * The names replaced on the modules that define them
 * (their callers read them at call time), a fresh mock each before each
 * case and restored after it; every other name stays
 * real.
 */
function stubs() {
  return {
    build: mock.method(connectionFactory, 'createAbapConnection', () =>
      fakeConnection(),
    ),
    // An on-premise system without the function: the configuration applies.
    lookup: mock.method(
      systemInformation,
      'readSystemInformation',
      async () => {
        throw Object.assign(new Error('placeholder'), {
          response: { status: 404 },
        });
      },
    ),
    // The real one, watched.
    fromHeaders: mock.method(credentialSources, 'credentialFromHeaders'),
    // The connect's system lookup reads the kind for a 404: on-premise, the
    // configuration applies.
    kind: mock.method(connectionFactory, 'systemKindOf', () => 'onprem'),
  };
}
let build: ReturnType<typeof stubs>['build'];
let lookup: ReturnType<typeof stubs>['lookup'];
let fromHeaders: ReturnType<typeof stubs>['fromHeaders'];

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
        call: (async () => {
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
    this.setConnectionContext({ kind: 'built', source });
  }
  fromHeaders(headers: Record<string, string | string[] | undefined>) {
    this.setConnectionContext(headerContext(headers));
  }
  connection() {
    return this.getConnection(new AbortController().signal);
  }
}

function fakeProvider() {
  return {
    kind: 'test',
    prepare: mock.fn(async () => ({ ok: true as const })),
    establish: mock.fn(async () => ({ ok: true as const })),
    authorize: mock.fn(async () => ({ ok: true as const })),
    rejected: mock.fn(async () => ({ ok: true as const })),
  } satisfies IAuthProvider;
}

function fakeConnection() {
  return { connect: mock.fn(async () => {}) } as any;
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
  const resolve = mock.fn(
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
  ({ build, lookup, fromHeaders } = stubs());
});
afterEach(() => {
  mock.restoreAll();
});

describe('setConnectionContext({ kind: built, source })', () => {
  it('builds no connection, resolves nothing and looks nothing up', async () => {
    const provider = fakeProvider();
    const source = sourceOf(provider);
    const server = new TestServer();
    server.fromSource(source);

    assert.equal(source.resolve.mock.callCount(), 0);
    assert.equal(build.mock.callCount(), 0);
    assert.equal(lookup.mock.callCount(), 0);
    assert.equal(provider.prepare.mock.callCount(), 0);
  });

  it('the master system and responsible from configuration reach the context, with no connection', async () => {
    const saved = { ...process.env };
    try {
      resetSystemContextCache();
      process.env.SAP_MASTER_SYSTEM = 'SYSTEM_FROM_CONFIG';
      process.env.SAP_RESPONSIBLE = 'USER_FROM_CONFIG';
      const server = new TestServer();
      server.fromSource(sourceOf(fakeProvider()));
      assertMatchObject(getSystemContext(), {
        masterSystem: 'SYSTEM_FROM_CONFIG',
        responsible: 'USER_FROM_CONFIG',
      });
      assert.equal(build.mock.callCount(), 0);
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
      assert.deepStrictEqual(await server.report(), {
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

    assert.equal(build.mock.callCount(), 1);
    const [settings, credential] = build.mock.calls[0]?.arguments ?? [];
    assert.equal(presented(credential), provider);
    assert.deepStrictEqual(settings, SETTINGS);
    for (const field of SECRET_FIELDS) {
      assertNoProperty(settings, field);
    }
    assert.equal((connection as any).connect.mock.callCount(), 1);
  });

  it('the same credential object: one connection, resolved per call', async () => {
    const source = sourceOf(fakeProvider());
    const server = new TestServer();
    server.fromSource(source);

    const first = await server.connection();
    const second = await server.connection();

    assert.equal(second, first);
    assert.equal(build.mock.callCount(), 1);
    assert.equal(source.resolve.mock.callCount(), 2);
  });

  it('a new credential object: the same connection, presenting it', async () => {
    const one = fakeProvider();
    const two = fakeProvider();
    const server = new TestServer();
    server.fromSource(sourceAnswering(one, two));

    const a = await server.connection();
    assert.equal(presented(build.mock.calls[0]?.arguments[1]), one);
    const b = await server.connection();

    assert.equal(b, a);
    assert.equal(build.mock.callCount(), 1);
    assert.equal(presented(build.mock.calls[0]?.arguments[1]), two);
  });

  it('a failed connect is not kept: the next call connects again', async () => {
    const failing = {
      connect: mock.fn(async () => Promise.reject(new Error('down'))),
    };
    build.mock.mockImplementationOnce(() => failing as any);
    const server = new TestServer();
    server.fromSource(sourceOf(fakeProvider()));

    await assertRejects(server.connection(), 'down');
    const connection = await server.connection();
    assert.notEqual(connection, failing);
    assert.equal(build.mock.callCount(), 2);
  });

  it('a source that fails reaches the caller as the error it is', async () => {
    const failure = new Error('destination refused');
    const server = new TestServer();
    server.fromSource({
      resolve: async () => {
        throw failure;
      },
    });
    assert.equal(await rejectionOf(server.connection()), failure);
    assert.equal(build.mock.callCount(), 0);
  });

  it('without a context it refuses', async () => {
    await assertRejects(
      new TestServer().connection(),
      /Connection context not set/,
    );
  });
});

describe("an embedder's setSystemContext survives a request", () => {
  for (const from of ['destination', 'headers'] as const) {
    it(
      format(
        'setting the context up from %s fills only what the embedder left unset',
        from,
      ),
      async () => {
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
          assertMatchObject(getSystemContext(), {
            masterSystem: 'SYSTEM_OF_EMBEDDER',
            responsible: 'USER_FROM_PROCESS',
          });
        } finally {
          process.env = saved;
          resetSystemContextCache();
        }
      },
    );
  }
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
      assertMatchObject(getSystemContext(), {
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

    assert.ok(
      fromHeaders.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, [headers]),
      ),
    );
    const answered = fromHeaders.mock.calls[0]?.result;
    assert.ok(answered !== undefined);
    const context = server.context();
    assert.equal(context?.kind, 'built');
    // No session id and no metadata: they were read by nothing (D26 E5).
    // The headers' digest names the envelope session (#392 spec §4.1).
    assert.deepStrictEqual(Object.keys(context ?? {}).sort(), [
      'kind',
      'sessionDigest',
      'source',
    ]);
    assert.ok(context?.kind === 'built');
    assert.ok(context.source !== undefined && context.source !== null);

    await server.connection();
    const [settings, credential] = build.mock.calls[0]?.arguments ?? [];
    assert.equal(presented(credential), answered.credential);
    assert.deepStrictEqual(settings, answered.settings);
    assert.equal(settings.authType, 'jwt');
    for (const field of SECRET_FIELDS) {
      assertNoProperty(settings, field);
    }
  });

  it('a user and password: basic, the secret in the credential only', async () => {
    const server = new TestServer();
    server.fromHeaders({
      'x-sap-url': 'https://system.example.invalid',
      'x-sap-login': 'user-placeholder',
      'x-sap-password': 'password-placeholder',
    });
    assert.equal(server.context()?.kind, 'built');
    await server.connection();
    const [settings, credential] = build.mock.calls[0]?.arguments ?? [];
    assert.ok(settings !== undefined);
    assert.equal(settings.authType, 'basic');
    assert.ok(!JSON.stringify(settings).includes('password-placeholder'));
    assert.equal(
      presented(credential),
      fromHeaders.mock.calls[0]?.result?.credential,
    );
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
    assert.equal(serverRefusalOf(thrown)?.code, 'credentials_required');
    assert.equal(fromHeaders.mock.callCount(), 0);
  });
});
