/**
 * A connection a server admits carries the server's one kind: an injected
 * connection with no kind of its own is given it where the server hands it
 * out, so its dispatch never falls back to `SAP_SYSTEM_TYPE` — a change of
 * the environment after construction does not move a registry's own
 * callback to another variant. A recorded or declared kind is never
 * overwritten (one of another kind is refused, as before).
 */

import assert from 'node:assert/strict';
import { afterEach, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { systemKindOf } from '../../../lib/connectionFactory';
import type {
  HandlerEntry,
  IHandlersRegistry,
} from '../../../lib/handlers/interfaces';
import { declareSystemKind } from '../../../lib/systemKind';

const saved = process.env.SAP_SYSTEM_TYPE;
afterEach(() => {
  if (saved === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = saved;
});

/** A registry whose own tool answers the kind its connection dispatches on. */
function kindReporter(connection: object): IHandlersRegistry {
  return {
    registerAllTools: (server: McpServer) => {
      server.registerTool('OwnKind', { description: 'own' }, async () => ({
        content: [{ type: 'text', text: systemKindOf(connection) ?? 'none' }],
      }));
    },
    registerTool: (_server: McpServer, _entry: HandlerEntry) => {},
    getRegisteredTools: () => ['OwnKind'],
  };
}

async function ownKindOn(server: EmbeddableMcpServer): Promise<string> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'admitted-kind', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    const answer = (await client.callTool({
      name: 'OwnKind',
      arguments: {},
    })) as { content?: Array<{ text?: string }> };
    return (answer.content ?? []).map((c) => c.text ?? '').join('\n');
  } finally {
    await client.close();
  }
}

it('an undeclared injected connection dispatches on the server’s kind, whatever SAP_SYSTEM_TYPE says later', async () => {
  delete process.env.SAP_SYSTEM_TYPE;
  const connection = {
    getBaseUrl: async () => 'https://system.example.invalid',
    makeAdtRequest: async () => ({ status: 200, data: '' }),
  };
  const server = new EmbeddableMcpServer({
    connection: connection as never,
    systemType: 'onprem',
    handlersRegistry: kindReporter(connection),
  });
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  assert.equal(await ownKindOn(server), 'onprem');
});

it('a declared kind is kept, not overwritten, when it is the server’s', async () => {
  const connection = {
    getBaseUrl: async () => 'https://system.example.invalid',
    makeAdtRequest: async () => ({ status: 200, data: '' }),
  };
  declareSystemKind(connection, 'cloud');
  const server = new EmbeddableMcpServer({
    connection: connection as never,
    systemType: 'cloud',
    handlersRegistry: kindReporter(connection),
  });
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  assert.equal(await ownKindOn(server), 'cloud');
});
