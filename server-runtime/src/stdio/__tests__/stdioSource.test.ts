import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import * as z from 'zod';

/**
 * On stdio the user is fixed for the process. The
 * broker answers the same provider for the process's life — a renewed token
 * (refresh, or a new login when the refresh fails) is written back by that
 * provider — so the one instance keeps its connection while `getProvider`
 * answers it, and replaces it only when SAP already lost the session, built
 * with the provider `getProvider` answers: the same one. Every call still
 * asks `getProvider` with a signal; the server keeps no provider of its own.
 */

let built = 0;
/** The connections built, by tag: a case marks one's session lost. */
const connections = new Map<string, { connected: boolean }>();

import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import {
  CompositeHandlersRegistry,
  type HandlerEntry,
} from '@mcp-abap-adt/lib/handlers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { presented } from '../../../../src/__tests__/helpers/presented';
import * as connectionFactory from '../../../../src/lib/connectionFactory';
import type { IDestinations } from '../auth/IAuthBrokerFactory.js';
import { StdioServer } from '../StdioServer.js';

// lib/connectionFactory's names replaced on the module that defines them
// (mock.method; their callers read them at call time), as the Jest factory
// did; the names it left out stay real.
const build = mock.method(
  connectionFactory,
  'createAbapConnection',
  (_settings: unknown, credential: unknown) => {
    built += 1;
    const connection = {
      tag: `connection-${built}`,
      credential,
      connected: false,
      connect: async () => {
        connection.connected = true;
      },
      isConnected: () => connection.connected,
      // An on-premise system without systeminformation: the lookup before
      // the first tool answers 404, and the configuration applies.
      makeAdtRequest: async () => {
        throw Object.assign(new Error('Request failed with status code 404'), {
          response: { status: 404 },
        });
      },
    };
    connections.set(connection.tag, connection);
    return connection;
  },
);

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
          inputSchema: z.object({}),
        } as never,
        call: (async (
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
  build.mock.resetCalls();
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'onprem';
});
afterEach(() => {
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

describe("stdio: the connection is kept while getProvider answers the session's provider", () => {
  it('the same provider on every call: the same connection, no reopen', async () => {
    const session = provider();
    const getProvider = mock.fn(
      async (
        _destination: string,
        _options?: { readonly signal?: AbortSignal | undefined },
      ) => session,
    );
    const destinations: IDestinations = {
      settingsFor: async () => ({
        url: 'https://system.example.invalid',
        authType: 'basic',
        // The user an on-premise system without the function needs stated.
        username: 'STDIO_USER',
      }),
      getProvider,
    };
    const { client, which } = await serve(destinations);
    try {
      assert.equal(await which(), 'connection-1');
      assert.equal(await which(), 'connection-1');
      assert.equal(await which(), 'connection-1');

      assert.equal(build.mock.callCount(), 1);
      assert.equal(presented(build.mock.calls[0]?.arguments[1]), session);
      // Asked on every call, each with a signal.
      assert.equal(getProvider.mock.callCount(), 3);
      for (const {
        arguments: [destination, options],
      } of getProvider.mock.calls) {
        assert.equal(destination, 'dest');
        assert.ok(options?.signal instanceof AbortSignal);
      }
    } finally {
      await client.close();
    }
  });

  it('a session SAP already lost: a new connection, built with the provider getProvider answers — the same one', async () => {
    const session = provider();
    const getProvider = mock.fn(async () => session);
    const destinations: IDestinations = {
      settingsFor: async () => ({
        url: 'https://system.example.invalid',
        authType: 'basic',
        // The user an on-premise system without the function needs stated.
        username: 'STDIO_USER',
      }),
      getProvider,
    };
    const { client, which } = await serve(destinations);
    try {
      assert.equal(await which(), 'connection-1');
      const lost = connections.get('connection-1');
      if (lost) lost.connected = false;
      assert.equal(await which(), 'connection-2');
      assert.equal(await which(), 'connection-2');

      assert.equal(build.mock.callCount(), 2);
      assert.equal(presented(build.mock.calls[0]?.arguments[1]), session);
      assert.equal(presented(build.mock.calls[1]?.arguments[1]), session);
      // The replacement's provider came from this call's getProvider.
      assert.equal(getProvider.mock.callCount(), 3);
    } finally {
      await client.close();
    }
  });
});
