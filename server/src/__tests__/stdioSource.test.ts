/**
 * D13 on stdio: the one instance keeps its connection while the
 * destination's `getProvider` answers the same provider, and builds a new one
 * — with the new provider — when the broker built a new provider. Every call
 * asks `getProvider` with a signal; the server keeps no provider of its own.
 */

let built = 0;
jest.mock('../../../src/lib/connectionFactory', () => ({
  ...jest.requireActual('../../../src/lib/connectionFactory'),
  createAbapConnection: jest.fn((_settings: unknown, credential: unknown) => {
    built += 1;
    return { tag: `connection-${built}`, credential, connect: async () => {} };
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
  build.mockClear();
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem'; // no system lookup on the stand-in
});
afterEach(() => {
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

describe('stdio: the connection follows the provider getProvider answers (D13)', () => {
  it('the same provider: one connection; a new provider: a new connection with it', async () => {
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
      expect(await which()).toBe('connection-2');
      expect(await which()).toBe('connection-2');

      expect(build).toHaveBeenCalledTimes(2);
      expect(build.mock.calls[0][1]).toBe(first);
      expect(build.mock.calls[1][1]).toBe(renewed);
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
});
