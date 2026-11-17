/**
 * The one kind is enforced wherever a connection is handed to work — the
 * main connection, a fresh one, a registry's own callback, a plain
 * registration's provided context — so a connection of another kind is
 * refused `system_type_conflict` before it is connected or used:
 *
 * - an onprem server whose `freshConnection` returns a connection the
 *   factory built for cloud: a long read refuses it, its `connect()` never
 *   called;
 * - a group listed for onprem whose provider hands a cloud context and a
 *   cloud connection: refused, nothing connected;
 * - an onprem server given a connection built for cloud, a registry's own
 *   callback: refused before the system lookup, the callback not run.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { SearchHandlersGroup } from '../../../lib/handlers/groups/SearchHandlersGroup';
import type {
  HandlerContext,
  HandlerEntry,
  IHandlersRegistry,
} from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { defaultSystemContextResolver } from '../../../lib/requestSystemResolution';

jest.setTimeout(60_000);

const saved = process.env.SAP_SYSTEM_TYPE;
beforeEach(() => {
  delete process.env.SAP_SYSTEM_TYPE;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});
afterEach(() => {
  if (saved === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = saved;
  jest.restoreAllMocks();
});

/** A connection the factory built for `kind`; nothing it is asked reaches a system. */
function builtFor(kind: 'onprem' | 'cloud') {
  const connection = createAbapConnection(
    { url: 'https://system.example.invalid', client: '100', authType: 'basic' },
    new BasicAuthProvider('KIND_USER', 'kind-password'),
    null,
    undefined,
    undefined,
    kind,
  );
  const connect = jest
    .spyOn(connection, 'connect')
    .mockRejectedValue(new Error('connect was called'));
  const sent = jest
    .spyOn(connection, 'makeAdtRequest')
    .mockRejectedValue(new Error('a request was sent'));
  return { connection, connect, sent };
}

async function call(
  server: McpServer | EmbeddableMcpServer,
  tool: string,
  args: Readonly<Record<string, unknown>>,
): Promise<string> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'kind-everywhere', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    const answer = (await client.callTool({ name: tool, arguments: args })) as {
      content?: Array<{ text?: string }>;
    };
    return (answer.content ?? []).map((c) => c.text ?? '').join('\n');
  } finally {
    await client.close();
  }
}

it("a fresh connection of another kind than the server's is refused before its connect", async () => {
  const main = {
    getBaseUrl: async () => 'https://system.example.invalid',
    makeAdtRequest: async () => ({ status: 200, data: '' }),
  };
  const fresh = builtFor('cloud');
  const server = new EmbeddableMcpServer({
    connection: main as never,
    systemType: 'onprem',
    freshConnection: async () => fresh.connection,
    handlersRegistry: new CompositeHandlersRegistry([
      new SearchHandlersGroup({ connection: null, logger: undefined } as never),
    ]),
  });
  const text = await call(server, 'SearchObject', {
    object_name: 'Z*',
    background: false,
  });
  expect(text).toContain('system_type_conflict');
  expect(fresh.connect).not.toHaveBeenCalled();
  expect(fresh.sent).not.toHaveBeenCalled();
});

it('a provided context of another kind than the listing is refused, nothing connected', async () => {
  const cloud = builtFor('cloud');
  const listedFor = {
    connection: { makeAdtRequest: async () => ({ status: 200, data: '' }) },
    logger: undefined,
    systemType: 'onprem',
  } as unknown as HandlerContext;
  const provided = {
    connection: cloud.connection,
    logger: undefined,
    systemType: 'cloud',
  } as unknown as HandlerContext;
  const group = new SearchHandlersGroup(listedFor);
  const server = new McpServer({ name: 'plain', version: '1.0.0' });
  group.registerHandlersOnCall(server, async () => provided);
  const text = await call(server, 'SearchObject', { object_name: 'Z*' });
  expect(text).toContain('system_type_conflict');
  expect(cloud.connect).not.toHaveBeenCalled();
  expect(cloud.sent).not.toHaveBeenCalled();
});

it("a registry's own callback on a connection of another kind is refused before the lookup", async () => {
  const cloud = builtFor('cloud');
  const ran: string[] = [];
  const registry: IHandlersRegistry = {
    registerAllTools: (server: McpServer) => {
      server.registerTool('OwnTool', { description: 'own' }, async () => {
        ran.push('callback');
        return { content: [{ type: 'text', text: 'ran' }] };
      });
    },
    registerTool: (_server: McpServer, _entry: HandlerEntry) => {},
    getRegisteredTools: () => ['OwnTool'],
  };
  const server = new EmbeddableMcpServer({
    connection: cloud.connection,
    systemType: 'onprem',
    handlersRegistry: registry,
    systemContextResolver: defaultSystemContextResolver,
  });
  const text = await call(server, 'OwnTool', {});
  expect(text).toContain('system_type_conflict');
  expect(ran).toEqual([]);
  expect(cloud.sent).not.toHaveBeenCalled();
});
