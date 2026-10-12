/**
 * A fresh connection on a host's connection comes from the host (spec §4.3,
 * D20–D22, §14.3).
 *
 * `CreatePackage` (high and low) and `LockPackage` over RFC, and
 * `DeletePackage` with `force_new_connection`, need an ABAP session of their
 * own. On an injected connection — here one whose configuration names RFC and
 * holds no usable credential, so nothing could be built from it — that session
 * is the host's `freshConnection` factory's: it is called with the request's
 * signal, the operation runs on what it returns, and the server disconnects
 * it when the operation (or the lock) ends. No credential provider and no
 * connection is built by the server. Without the factory the operation is
 * refused `fresh_connection_unavailable` in fixed words, and nothing is sent.
 *
 * Every call goes through an `EmbeddableMcpServer` and an MCP client, so the
 * signal the factory receives is the one the tool wrapper set for the request.
 */

/** Every credential provider the server constructs, by class. */
const constructedProviders: string[] = [];
jest.mock('@mcp-abap-adt/auth-providers', () => {
  const actual = jest.requireActual('@mcp-abap-adt/auth-providers');
  const watched = (name: string) =>
    new Proxy(actual[name], {
      construct(target, args, newTarget) {
        constructedProviders.push(name);
        return Reflect.construct(target, args, newTarget);
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
  return {
    ...actual,
    BasicAuthProvider: watched('BasicAuthProvider'),
    TokenAuthProvider: watched('TokenAuthProvider'),
    SamlAuthProvider: watched('SamlAuthProvider'),
    CertificateAuthProvider: watched('CertificateAuthProvider'),
  };
});

/** Every connection the server's factory builds. */
const builtConnections: unknown[] = [];
jest.mock('../../lib/connectionFactory', () => {
  const actual = jest.requireActual('../../lib/connectionFactory');
  return {
    ...actual,
    createAbapConnection: (...args: unknown[]) => {
      builtConnections.push(args[0]);
      return (actual.createAbapConnection as (...a: unknown[]) => unknown)(
        ...args,
      );
    },
  };
});

import type { AbapConnection } from '@mcp-abap-adt/connection';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { EmbeddableMcpServer } from '../../embeddable/EmbeddableMcpServer';
import { FRESH_CONNECTION_UNAVAILABLE_WORDS } from '../../lib/auth/serverRefusal';
import { liveDebugPorts } from '../../lib/debugger/ports';
import { runWithRequestSignal } from '../../lib/requestSignal';
import {
  type RecordingConnection,
  recordingConnection,
} from '../helpers/recordingConnection';

/**
 * A connection whose configuration names RFC and holds no credential: no
 * user, no password, no token, no cookies.
 */
function rfcConnection(): RecordingConnection & {
  getConfig(): Record<string, unknown>;
  connect: jest.Mock;
  setSessionType: jest.Mock;
  disconnect: jest.Mock;
} {
  return Object.assign(recordingConnection(), {
    connect: jest.fn(async () => {}),
    setSessionType: jest.fn(),
    getConfig: () => ({
      url: 'https://sap.example.invalid',
      client: '100',
      connectionType: 'rfc',
    }),
    disconnect: jest.fn(async () => {}),
  });
}

interface Factory {
  (options: { signal?: AbortSignal }): Promise<IAbapConnection>;
  signals: Array<AbortSignal | undefined>;
  made: ReturnType<typeof rfcConnection>[];
}

/** The host's factory: records each call's signal and what it handed over. */
function hostFactory(): Factory {
  const signals: Array<AbortSignal | undefined> = [];
  const made: ReturnType<typeof rfcConnection>[] = [];
  const factory = async (options: {
    signal?: AbortSignal;
  }): Promise<IAbapConnection> => {
    signals.push(options.signal);
    const fresh = rfcConnection();
    made.push(fresh);
    return fresh;
  };
  return Object.assign(factory, { signals, made });
}

let previousType: string | undefined;

beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  constructedProviders.length = 0;
  builtConnections.length = 0;
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  jest.restoreAllMocks();
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

async function served(
  injected: IAbapConnection,
  freshConnection?:
    | Factory
    | ((o: { signal?: AbortSignal }) => Promise<IAbapConnection>),
): Promise<Client> {
  const server = new EmbeddableMcpServer({
    connection: injected as unknown as AbapConnection,
    exposition: ['high', 'low'],
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
    'CreatePackage (low) over RFC',
    'CreatePackageLow',
    { package_name: 'ZFRESH', super_package: 'ZROOT', description: 'd' },
  ],
  [
    'LockPackage over RFC',
    'LockPackageLow',
    { package_name: 'ZFRESH', super_package: 'ZROOT' },
  ],
  [
    'DeletePackage with force_new_connection',
    'DeletePackageLow',
    { package_name: 'ZFRESH', force_new_connection: true },
  ],
];

describe('with the host’s freshConnection', () => {
  it.each(OPERATIONS)(
    '%s runs on the factory’s connection, called with the request’s signal',
    async (_label, tool, args) => {
      const injected = rfcConnection();
      const factory = hostFactory();
      const client = await served(injected, factory);

      await client.callTool({ name: tool, arguments: args });

      expect(factory.signals).toHaveLength(1);
      expect(factory.signals[0]).toBeInstanceOf(AbortSignal);
      expect(factory.made).toHaveLength(1);
      const fresh = factory.made[0];
      expect(fresh.connect).toHaveBeenCalledTimes(1);
      expect(fresh.requests.length).toBeGreaterThan(0);
      expect(injected.requests).toHaveLength(0);
      expect(injected.connect).not.toHaveBeenCalled();
      expect(constructedProviders).toEqual([]);
      expect(builtConnections).toEqual([]);
      await client.close();
    },
  );

  it.each(OPERATIONS.filter(([, tool]) => tool !== 'LockPackageLow'))(
    '%s disconnects the factory’s connection when it answers',
    async (_label, tool, args) => {
      const factory = hostFactory();
      const client = await served(rfcConnection(), factory);

      await client.callTool({ name: tool, arguments: args });

      expect(factory.made[0].disconnect).toHaveBeenCalledTimes(1);
      await client.close();
    },
  );

  it('LockPackage keeps the factory’s connection under its handle until the unlock disconnects it', async () => {
    const injected = rfcConnection();
    const factory = hostFactory();
    const client = await served(injected, factory);

    const locked = await client.callTool({
      name: 'LockPackageLow',
      arguments: { package_name: 'ZFRESH', super_package: 'ZROOT' },
    });
    const lockHandle = JSON.parse(textOf(locked)).lock_handle as string;
    expect(typeof lockHandle).toBe('string');
    const fresh = factory.made[0];
    expect(fresh.disconnect).not.toHaveBeenCalled();
    const sentBeforeUnlock = fresh.requests.length;

    await client.callTool({
      name: 'UnlockPackageLow',
      arguments: {
        package_name: 'ZFRESH',
        super_package: 'ZROOT',
        lock_handle: lockHandle,
        session_id: 'embedded',
      },
    });

    expect(fresh.requests.length).toBeGreaterThan(sentBeforeUnlock);
    expect(fresh.disconnect).toHaveBeenCalledTimes(1);
    expect(injected.requests).toHaveLength(0);
    await client.close();
  });

  it('the factory’s signal is the request’s: it aborts when the client cancels the call', async () => {
    let received: AbortSignal | undefined;
    let called!: () => void;
    const reached = new Promise<void>((resolve) => {
      called = resolve;
    });
    const fresh = rfcConnection();
    const factory = (options: { signal?: AbortSignal }) => {
      received = options.signal;
      called();
      return new Promise<IAbapConnection>((resolve, reject) => {
        options.signal?.addEventListener('abort', () =>
          reject(new Error('the host gave up')),
        );
        if (!options.signal) resolve(fresh);
      });
    };
    const client = await served(rfcConnection(), factory);
    const controller = new AbortController();
    const done = client
      .callTool(
        { name: 'CreatePackageLow', arguments: OPERATIONS[1][2] },
        undefined,
        { signal: controller.signal },
      )
      .catch((error: unknown) => error);

    await Promise.race([reached, done]);
    expect(received).toBeInstanceOf(AbortSignal);
    expect(received?.aborted).toBe(false);
    controller.abort();
    await done;
    for (let turn = 0; turn < 100 && !received?.aborted; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(received?.aborted).toBe(true);
    expect(fresh.requests).toHaveLength(0);
    await client.close();
  });
});

describe('a handed-over connection that cannot connect', () => {
  it('is closed, the failure answered, nothing sent', async () => {
    const fresh = rfcConnection();
    fresh.connect.mockRejectedValue(new Error('the system said no'));
    const client = await served(rfcConnection(), async () => fresh);

    const result = await client.callTool({
      name: 'CreatePackageLow',
      arguments: OPERATIONS[1][2],
    });

    expect(result.isError).toBe(true);
    expect(fresh.disconnect).toHaveBeenCalledTimes(1);
    expect(fresh.requests).toHaveLength(0);
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
      name: 'CreatePackageLow',
      arguments: OPERATIONS[1][2],
    });

    expect(JSON.parse(textOf(result)).error).toBe(
      'fresh_connection_unavailable',
    );
    expect(factory.signals).toHaveLength(0);
    expect(injected.requests).toHaveLength(0);
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
      name: 'CreatePackageLow',
      arguments: OPERATIONS[1][2],
    });

    expect(earlier.signals).toHaveLength(0);
    expect(later.signals).toHaveLength(1);
    await first.close();
    await second.close();
  });
});

describe('without freshConnection', () => {
  it.each(OPERATIONS)(
    '%s is refused fresh_connection_unavailable, nothing sent',
    async (_label, tool, args) => {
      const injected = rfcConnection();
      const client = await served(injected);

      const result = await client.callTool({ name: tool, arguments: args });

      expect(result.isError).toBe(true);
      const answer = JSON.parse(textOf(result));
      expect(answer.error).toBe('fresh_connection_unavailable');
      expect(answer.message).toBe(FRESH_CONNECTION_UNAVAILABLE_WORDS);
      expect(injected.requests).toHaveLength(0);
      expect(constructedProviders).toEqual([]);
      expect(builtConnections).toEqual([]);
      await client.close();
    },
  );
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

  it('comes from the host’s factory, with the request’s signal, stateful and connected', async () => {
    const injected = rfcConnection();
    const factory = hostFactory();
    const client = await served(injected, factory);
    const request = new AbortController();

    const own = await openForDebugSession(injected, request.signal);

    expect(own).toBe(factory.made[0]);
    expect(factory.signals).toEqual([request.signal]);
    expect(factory.made[0].connect).toHaveBeenCalledTimes(1);
    expect(factory.made[0].setSessionType).toHaveBeenCalledWith('stateful');
    expect(injected.requests).toHaveLength(0);
    expect(injected.setSessionType).not.toHaveBeenCalled();
    expect(constructedProviders).toEqual([]);
    expect(builtConnections).toEqual([]);
    await client.close();
  });

  it('is refused fresh_connection_unavailable without one, nothing sent', async () => {
    const injected = rfcConnection();
    const client = await served(injected);

    const refused = expect(
      openForDebugSession(injected, new AbortController().signal),
    ).rejects.toMatchObject({
      serverRefusal: 'fresh_connection_unavailable',
      message: FRESH_CONNECTION_UNAVAILABLE_WORDS,
    });
    await refused;

    expect(injected.requests).toHaveLength(0);
    expect(injected.connect).not.toHaveBeenCalled();
    expect(constructedProviders).toEqual([]);
    expect(builtConnections).toEqual([]);
    await client.close();
  });
});
