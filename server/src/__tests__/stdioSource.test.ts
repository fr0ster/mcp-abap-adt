/**
 * D13 (amended by D56) on stdio: the one instance keeps its connection for
 * its life — no reopen while the instance lives, only when SAP already lost
 * the session. A new provider the broker built (`getProvider` answers one
 * when what its build read changed) does not replace the connection: a
 * reopen would leave the locks of the old session behind. Every call still
 * asks `getProvider` with a signal; the server keeps no provider of its own,
 * and a connection replaced because its session was lost is built with the
 * provider that call resolved.
 */

let built = 0;
/** The connections built, by tag: a case marks one's session lost. */
const connections = new Map<string, { connected: boolean }>();
jest.mock('../../../src/lib/connectionFactory', () => ({
  ...jest.requireActual('../../../src/lib/connectionFactory'),
  createAbapConnection: jest.fn((_settings: unknown, credential: unknown) => {
    built += 1;
    const connection = {
      tag: `connection-${built}`,
      credential,
      connected: false,
      connect: async () => {
        connection.connected = true;
      },
      isConnected: () => connection.connected,
    };
    connections.set(connection.tag, connection);
    return connection;
  }),
}));

import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import {
  CompositeHandlersRegistry,
  type HandlerEntry,
} from '@mcp-abap-adt/lib/handlers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createAbapConnection } from '../../../src/lib/connectionFactory';
import type { IDestinations } from '../auth/IAuthBrokerFactory.js';
import { StdioServer } from '../StdioServer.js';

const build = createAbapConnection as jest.Mock;

function provider(): IAuthProvider {
  const ok = async () => ({ ok: true as const });
  return {
    kind: 'test',
    prepare: ok,
    establish: ok,
    authorize: ok,
    rejected: ok,
  };
}

/** One tool that answers the tag of the connection it was given. */
const registry = new CompositeHandlersRegistry([
  {
    getName: () => 'which',
    registerHandlers: () => {},
    getHandlers: (): HandlerEntry[] => [
      {
        toolDefinition: {
          name: 'WhichConnection',
          description: 'answers its connection',
          inputSchema: { type: 'object', properties: {} },
        } as never,
        handler: (async (
          context: { connection: { tag: string } },
          _args: unknown,
        ) => ({
          content: [{ type: 'text', text: context.connection.tag }],
        })) as never,
      },
    ],
  },
]);

async function serve(destinations: IDestinations) {
  const server = new StdioServer(registry, destinations);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'stdio-source', version: '1.0.0' });
  await Promise.all([
    server.start('dest', serverSide),
    client.connect(clientSide),
  ]);
  const which = async () => {
    const result = (await client.callTool({
      name: 'WhichConnection',
      arguments: {},
    })) as { content: Array<{ text: string }> };
    return result.content[0].text;
  };
  return { client, which };
}

let previousType: string | undefined;
beforeEach(() => {
  built = 0;
  connections.clear();
  build.mockClear();
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem'; // no system lookup on the stand-in
});
afterEach(() => {
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

describe('stdio: the connection is kept for the instance\'s life (D13, D56)', () => {
  it('a new provider from getProvider: the same connection, no reopen', async () => {
    const first = provider();
    const renewed = provider();
    const answers = [first, first, renewed, renewed];
    const getProvider = jest.fn(
      async (
        _destination: string,
        _options?: { readonly signal?: AbortSignal | undefined },
      ) => answers.shift() ?? renewed,
    );
    const destinations: IDestinations = {
      settingsFor: async () => ({
        url: 'https://system.example.invalid',
        authType: 'basic',
      }),
      getProvider,
    };
    const { client, which } = await serve(destinations);
    try {
      expect(await which()).toBe('connection-1');
      expect(await which()).toBe('connection-1');
      expect(await which()).toBe('connection-1');
      expect(await which()).toBe('connection-1');

      expect(build).toHaveBeenCalledTimes(1);
      expect(build.mock.calls[0][1]).toBe(first);
      // Asked on every call, each with a signal.
      expect(getProvider).toHaveBeenCalledTimes(4);
      for (const [destination, options] of getProvider.mock.calls) {
        expect(destination).toBe('dest');
        expect(options?.signal).toBeInstanceOf(AbortSignal);
      }
    } finally {
      await client.close();
    }
  });

  it('a session SAP already lost: a new connection, with the provider that call resolved', async () => {
    const first = provider();
    const renewed = provider();
    const answers = [first, renewed, renewed];
    const destinations: IDestinations = {
      settingsFor: async () => ({
        url: 'https://system.example.invalid',
        authType: 'basic',
      }),
      getProvider: async () => answers.shift() ?? renewed,
    };
    const { client, which } = await serve(destinations);
    try {
      expect(await which()).toBe('connection-1');
      expect(await which()).toBe('connection-1');
      const lost = connections.get('connection-1');
      if (lost) lost.connected = false;
      expect(await which()).toBe('connection-2');

      expect(build).toHaveBeenCalledTimes(2);
      expect(build.mock.calls[0][1]).toBe(first);
      expect(build.mock.calls[1][1]).toBe(renewed);
    } finally {
      await client.close();
    }
  });
});
