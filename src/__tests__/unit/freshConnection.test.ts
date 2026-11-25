import assert from 'node:assert/strict';
import {
  afterEach,
  beforeEach,
  describe,
  it,
  type Mock,
  mock,
} from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';

/**
 * A fresh connection on a host's connection comes from the host.
 *
 * `CreatePackage` (high, and compact's `HandlerCreate` PACKAGE) and compact's
 * `HandlerLock` PACKAGE over RFC, and the high `DeletePackage` with
 * `force_new_connection`, need an ABAP session of their own (19.0.0: the low
 * set's package tools left the full binaries; compact took their cases). On an injected connection — here one whose configuration names RFC and
 * holds no usable credential, so nothing could be built from it — that session
 * is the host's `freshConnection` factory's: it is called with no argument —
 * no signal (a fresh connection is made inside a started tool, which
 * runs to its end) —, the operation runs on what it returns, and the server
 * disconnects it when the operation (or the lock) ends. No credential provider and no
 * connection is built by the server. Without the factory the operation is
 * refused `fresh_connection_unavailable` in fixed words, and nothing is sent.
 *
 * Every call goes through an `EmbeddableMcpServer` and an MCP client, so the
 * factory is called inside the request's scope, where the tool wrapper set
 * the request's signal — and still receives none.
 */

import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import type { AbapConnection } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { EmbeddableMcpServer } from '../../embeddable/EmbeddableMcpServer';
import { FRESH_CONNECTION_UNAVAILABLE_WORDS } from '../../lib/auth/serverRefusal';
import { CompactHandlersGroup } from '../../lib/compact/group';
import * as connectionFactory from '../../lib/connectionFactory';
import { liveDebugPorts } from '../../lib/debugger/ports';
import { HighLevelHandlersGroup } from '../../lib/handlers/groups/HighLevelHandlersGroup';
import type { HandlerContext } from '../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry';
import { runWithRequestSignal } from '../../lib/requestSignal';
import { assertMatchObject, rejectionOf } from '../helpers/assertions';
import {
  basicAuthProvider as basicProvider,
  certificateAuthProvider as certificateProvider,
  samlAuthProvider as samlProvider,
  tokenAuthProvider as tokenProvider,
} from '../helpers/packageFiles';
import {
  type RecordingConnection,
  recordingConnection,
} from '../helpers/recordingConnection';

/** Every credential provider the server constructs, by class. */
const constructedProviders: string[] = [];
/** A provider class that records each construction and each static call. */
function watched<T extends object>(name: string, actual: T): T {
  return new Proxy(actual, {
    construct(target, args, newTarget) {
      constructedProviders.push(name);
      return Reflect.construct(target as never, args, newTarget);
    },
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value === 'function' && property !== 'prototype') {
        return (...args: unknown[]) => {
          constructedProviders.push(`${name}.${String(property)}`);
          return value.apply(target, args);
        };
      }
      return value;
    },
  });
}

/** Every connection the server's factory builds. */
const builtConnections: unknown[] = [];
// The real factory, read before it is replaced.
const realCreateAbapConnection = connectionFactory.createAbapConnection;

// The four provider classes replaced on the auth-providers modules that
// define them (the package index re-exports them by getter, read at call
// time), and lib/connectionFactory's createAbapConnection on its own module,
// every other name stays real. Every case
// restores every mock after it: they are replaced before each.
function watchConstructions(): void {
  mock.property(
    basicProvider,
    'BasicAuthProvider',
    watched('BasicAuthProvider', basicProvider.BasicAuthProvider),
  );
  mock.property(
    tokenProvider,
    'TokenAuthProvider',
    watched('TokenAuthProvider', tokenProvider.TokenAuthProvider),
  );
  mock.property(
    samlProvider,
    'SamlAuthProvider',
    watched('SamlAuthProvider', samlProvider.SamlAuthProvider),
  );
  mock.property(
    certificateProvider,
    'CertificateAuthProvider',
    watched(
      'CertificateAuthProvider',
      certificateProvider.CertificateAuthProvider,
    ),
  );
  mock.method(
    connectionFactory,
    'createAbapConnection',
    (...args: Parameters<typeof realCreateAbapConnection>) => {
      builtConnections.push(args[0]);
      return realCreateAbapConnection(...args);
    },
  );
}

/**
 * A connection whose configuration names RFC and holds no credential: no
 * user, no password, no token, no cookies.
 */
function rfcConnection(): RecordingConnection & {
  getConfig(): Record<string, unknown>;
  connect: Mock<() => Promise<void>>;
  setSessionType: Mock<(...args: unknown[]) => void>;
  disconnect: Mock<() => Promise<void>>;
} {
  return Object.assign(recordingConnection(), {
    connect: mock.fn(async () => {}),
    setSessionType: mock.fn(),
    getConfig: () => ({
      url: 'https://sap.example.invalid',
      client: '100',
      connectionType: 'rfc',
    }),
    disconnect: mock.fn(async () => {}),
  });
}

interface Factory {
  (): Promise<IAbapConnection>;
  /** The arguments of each call, as the server passed them. */
  calls: unknown[][];
  made: ReturnType<typeof rfcConnection>[];
}

/** The host's factory: records each call's arguments and what it handed over. */
function hostFactory(): Factory {
  const calls: unknown[][] = [];
  const made: ReturnType<typeof rfcConnection>[] = [];
  const factory = async (...args: unknown[]): Promise<IAbapConnection> => {
    calls.push(args);
    const fresh = rfcConnection();
    made.push(fresh);
    return fresh;
  };
  return Object.assign(factory, { calls, made });
}

let previousType: string | undefined;

beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  constructedProviders.length = 0;
  builtConnections.length = 0;
  mock.method(process.stderr, 'write', () => true);
  watchConstructions();
});

afterEach(() => {
  mock.restoreAll();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

async function served(
  injected: IAbapConnection,
  freshConnection?: () => Promise<IAbapConnection>,
): Promise<Client> {
  // The high set and both compact halves, as the full and the compact binaries
  // serve them.
  const context = {
    connection: null as never,
    logger: undefined,
  } as unknown as HandlerContext;
  const server = new EmbeddableMcpServer({
    connection: injected as unknown as AbapConnection,
    handlersRegistry: new CompositeHandlersRegistry([
      new HighLevelHandlersGroup(context),
      new CompactHandlersGroup(context, [
        compactReadOnlyEntries,
        compactModifyEntries,
      ]),
    ]),
    systemType: 'onprem',
    systemContextResolver: null,
    systemContext: { responsible: 'DEVELOPER', masterSystem: 'DEV' },
    ...(freshConnection ? { freshConnection } : {}),
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'fresh-connection', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

function textOf(result: unknown): string {
  const content = (result as { content: Array<{ text: string }> }).content;
  return content.map((c) => c.text).join('\n');
}

/** The four operations, each called once. */
const OPERATIONS: Array<[string, string, Record<string, unknown>]> = [
  [
    'CreatePackage (high) over RFC',
    'CreatePackage',
    { package_name: 'ZFRESH', super_package: 'ZROOT', description: 'd' },
  ],
  [
    'HandlerCreate PACKAGE over RFC',
    'HandlerCreate',
    {
      object_type: 'PACKAGE',
      package_name: 'ZFRESH',
      super_package: 'ZROOT',
      description: 'd',
    },
  ],
  [
    'UpdatePackage (high) over RFC',
    'UpdatePackage',
    { package_name: 'ZFRESH', description: 'd' },
  ],
  [
    'HandlerLock PACKAGE over RFC',
    'HandlerLock',
    { object_type: 'PACKAGE', object_name: 'ZFRESH', super_package: 'ZROOT' },
  ],
  [
    'DeletePackage (high) with force_new_connection',
    'DeletePackage',
    { package_name: 'ZFRESH', force_new_connection: true },
  ],
];

describe('with the host’s freshConnection', () => {
  for (const [_label, tool, args] of OPERATIONS) {
    it(
      format(
        '%s runs on the factory’s connection, the factory called with no argument',
        _label,
      ),
      async () => {
        const injected = rfcConnection();
        const factory = hostFactory();
        const client = await served(injected, factory);

        await client.callTool({ name: tool, arguments: args });

        assert.deepStrictEqual(factory.calls, [[]]);
        assert.equal(factory.made.length, 1);
        const fresh = factory.made[0];
        assert.equal(fresh.connect.mock.callCount(), 1);
        assert.ok(fresh.requests.length > 0);
        assert.equal(injected.requests.length, 0);
        assert.equal(injected.connect.mock.callCount(), 0);
        assert.deepStrictEqual(constructedProviders, []);
        assert.deepStrictEqual(builtConnections, []);
        await client.close();
      },
    );
  }

  for (const [_label, tool, args] of OPERATIONS.filter(
    ([, tool]) => tool !== 'HandlerLock',
  )) {
    it(
      format('%s disconnects the factory’s connection when it answers', _label),
      async () => {
        const factory = hostFactory();
        const client = await served(rfcConnection(), factory);

        await client.callTool({ name: tool, arguments: args });

        assert.equal(factory.made[0].disconnect.mock.callCount(), 1);
        await client.close();
      },
    );
  }

  it('HandlerLock PACKAGE keeps the factory’s connection under its handle until HandlerUnlock disconnects it', async () => {
    const injected = rfcConnection();
    const factory = hostFactory();
    const client = await served(injected, factory);

    const locked = await client.callTool({
      name: 'HandlerLock',
      arguments: {
        object_type: 'PACKAGE',
        object_name: 'ZFRESH',
        super_package: 'ZROOT',
      },
    });
    const lockHandle = JSON.parse(textOf(locked)).lock_handle as string;
    assert.equal(typeof lockHandle, 'string');
    const fresh = factory.made[0];
    assert.equal(fresh.disconnect.mock.callCount(), 0);
    const sentBeforeUnlock = fresh.requests.length;

    await client.callTool({
      name: 'HandlerLock',
      arguments: {
        action: 'unlock',
        object_type: 'PACKAGE',
        object_name: 'ZFRESH',
        lock_handle: lockHandle,
      },
    });

    assert.ok(fresh.requests.length > sentBeforeUnlock);
    assert.equal(fresh.disconnect.mock.callCount(), 1);
    assert.equal(injected.requests.length, 0);
    await client.close();
  });
});

describe('a handed-over connection that cannot connect', () => {
  it('is closed, the failure answered, nothing sent', async () => {
    const fresh = rfcConnection();
    fresh.connect.mock.mockImplementation(async () => {
      throw new Error('the system said no');
    });
    const client = await served(rfcConnection(), async () => fresh);

    const result = await client.callTool({
      name: 'HandlerCreate',
      arguments: OPERATIONS[1][2],
    });

    assert.equal(result.isError, true);
    assert.equal(fresh.disconnect.mock.callCount(), 1);
    assert.equal(fresh.requests.length, 0);
    await client.close();
  });
});

describe('the same connection injected again', () => {
  it('without freshConnection: the later injection wins, the call is refused', async () => {
    const injected = rfcConnection();
    const factory = hostFactory();
    const first = await served(injected, factory);
    const second = await served(injected);

    const result = await second.callTool({
      name: 'HandlerCreate',
      arguments: OPERATIONS[1][2],
    });

    assert.equal(
      JSON.parse(textOf(result)).error,
      'fresh_connection_unavailable',
    );
    assert.equal(factory.calls.length, 0);
    assert.equal(injected.requests.length, 0);
    await first.close();
    await second.close();
  });

  it('with another freshConnection: the later factory is the one called', async () => {
    const injected = rfcConnection();
    const earlier = hostFactory();
    const later = hostFactory();
    const first = await served(injected, earlier);
    const second = await served(injected, later);

    await first.callTool({
      name: 'HandlerCreate',
      arguments: OPERATIONS[1][2],
    });

    assert.equal(earlier.calls.length, 0);
    assert.deepStrictEqual(later.calls, [[]]);
    await first.close();
    await second.close();
  });
});

describe('without freshConnection', () => {
  for (const [_label, tool, args] of OPERATIONS) {
    it(
      format(
        '%s is refused fresh_connection_unavailable, nothing sent',
        _label,
      ),
      async () => {
        const injected = rfcConnection();
        const client = await served(injected);

        const result = await client.callTool({ name: tool, arguments: args });

        assert.equal(result.isError, true);
        const answer = JSON.parse(textOf(result));
        assert.equal(answer.error, 'fresh_connection_unavailable');
        assert.equal(answer.message, FRESH_CONNECTION_UNAVAILABLE_WORDS);
        assert.equal(injected.requests.length, 0);
        assert.deepStrictEqual(constructedProviders, []);
        assert.deepStrictEqual(builtConnections, []);
        await client.close();
      },
    );
  }
});

/**
 * The debugger is the fourth caller (`src/lib/debugger/ports.ts`): a debug
 * session opens a stateful connection of its own through `openFreshConnection`
 * — on an injected connection, the host's factory, else the refusal.
 */
describe('a debug session’s own connection', () => {
  /** The debug ports' `openConnection`, called as a tool call would: in its request's scope. */
  async function openForDebugSession(
    injected: ReturnType<typeof rfcConnection>,
    signal: AbortSignal,
  ) {
    return runWithRequestSignal(signal, () =>
      liveDebugPorts().openConnection({
        connection: injected as unknown as AbapConnection,
        logger: undefined as never,
      }),
    );
  }

  it('comes from the host’s factory, called with no argument, stateful and connected', async () => {
    const injected = rfcConnection();
    const factory = hostFactory();
    const client = await served(injected, factory);
    const request = new AbortController();

    const own = await openForDebugSession(injected, request.signal);

    assert.equal(own, factory.made[0]);
    assert.deepStrictEqual(factory.calls, [[]]);
    assert.equal(factory.made[0].connect.mock.callCount(), 1);
    assert.ok(
      factory.made[0].setSessionType.mock.calls.some((c) =>
        isDeepStrictEqual(c.arguments, ['stateful']),
      ),
    );
    assert.equal(injected.requests.length, 0);
    assert.equal(injected.setSessionType.mock.callCount(), 0);
    assert.deepStrictEqual(constructedProviders, []);
    assert.deepStrictEqual(builtConnections, []);
    await client.close();
  });

  it('is refused fresh_connection_unavailable without one, nothing sent', async () => {
    const injected = rfcConnection();
    const client = await served(injected);

    const refused = rejectionOf(
      openForDebugSession(injected, new AbortController().signal),
    );
    assertMatchObject(await refused, {
      serverRefusal: 'fresh_connection_unavailable',
      message: FRESH_CONNECTION_UNAVAILABLE_WORDS,
    });

    assert.equal(injected.requests.length, 0);
    assert.equal(injected.connect.mock.callCount(), 0);
    assert.deepStrictEqual(constructedProviders, []);
    assert.deepStrictEqual(builtConnections, []);
    await client.close();
  });
});
