/**
 * One kind per server (the owner, 2026-11-17): fixed at construction — the
 * stated `systemType`, else `SAP_SYSTEM_TYPE` as it was then — and the one
 * kind its listing, its argument check and its dispatch use. A connection
 * whose recorded or declared kind differs is refused `system_type_conflict`
 * before anything is used or sent.
 *
 * - a connection declared cloud after a server started under
 *   `SAP_SYSTEM_TYPE=onprem`: refused `system_type_conflict`;
 * - a server stating `onprem` given a connection the factory built for
 *   cloud: refused `system_type_conflict`, nothing sent.
 */

import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CompactReadOnlyHandlersGroup } from '../../../../compact-readonly-entries/src/group';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { ReadOnlyHandlersGroup } from '../../../lib/handlers/groups/ReadOnlyHandlersGroup';
import { SearchHandlersGroup } from '../../../lib/handlers/groups/SearchHandlersGroup';
import { SystemHandlersGroup } from '../../../lib/handlers/groups/SystemHandlersGroup';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { declareSystemKind } from '../../../lib/systemKind';

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

const placeholder = {
  connection: null,
  logger: undefined,
} as unknown as HandlerContext;

const registry = () =>
  new CompositeHandlersRegistry([
    new ReadOnlyHandlersGroup(placeholder),
    new SearchHandlersGroup(placeholder),
    new SystemHandlersGroup(placeholder),
    new CompactReadOnlyHandlersGroup(placeholder),
  ]);

/** Calls both variants' schemas take: what refuses them is the kind. */
const CALLS = [
  ['SearchObject', { object_name: 'Z*' }],
  ['HandlerSystem', { action: 'search_object', object_name: 'Z*' }],
] as const;

async function callOn(
  server: EmbeddableMcpServer,
  tool: string,
  args: Readonly<Record<string, unknown>>,
): Promise<string> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'one-kind', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    const answer = (await client.callTool({
      name: tool,
      arguments: { ...args, background: false },
    })) as { content?: Array<{ text?: string }> };
    return (answer.content ?? []).map((c) => c.text ?? '').join('\n');
  } finally {
    await client.close();
  }
}

it.each(CALLS)(
  'a connection declared cloud after an onprem start is refused system_type_conflict: %s',
  async (tool, args) => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    const requests: string[] = [];
    const connection = {
      getBaseUrl: async () => 'https://system.example.invalid',
      makeAdtRequest: async (options: { url: string }) => {
        requests.push(options.url);
        return { status: 200, data: '' };
      },
    };
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: registry(),
    });
    declareSystemKind(connection, 'cloud');
    const text = await callOn(server, tool, args);
    expect(text).toContain('system_type_conflict');
    expect(requests).toEqual([]);
  },
);

it.each(CALLS)(
  'a server stating onprem given a connection built for cloud is refused system_type_conflict: %s',
  async (tool, args) => {
    const connection = createAbapConnection(
      {
        url: 'https://system.example.invalid',
        client: '100',
        authType: 'basic',
      },
      new BasicAuthProvider('KIND_USER', 'kind-password'),
      null,
      undefined,
      undefined,
      'cloud',
    );
    const sent = jest.spyOn(connection, 'makeAdtRequest');
    const server = new EmbeddableMcpServer({
      connection,
      systemType: 'onprem',
      handlersRegistry: registry(),
    });
    const text = await callOn(server, tool, args);
    expect(text).toContain('system_type_conflict');
    expect(sent).not.toHaveBeenCalled();
  },
);
