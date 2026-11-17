/**
 * The kind a call is checked on is the kind it is dispatched on: a kind
 * recorded on the connection (`declareSystemKind`) is never erased by a
 * context that states none, and the environment never overrides it.
 *
 * - a connection declared cloud, a plain registration or an exporter that
 *   states no kind: `SearchObject` with the cloud-only search name `SIA1`
 *   is read on cloud — neither `system_type_required` nor a type refusal;
 * - the server with no `systemType`, `SAP_SYSTEM_TYPE=onprem` in the
 *   environment and a connection declared cloud: the same, on cloud.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CompactReadOnlyHandlersGroup } from '../../../../compact-readonly-entries/src/group';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { SYSTEM_TYPE_REQUIRED_WORDS } from '../../../lib/auth/serverRefusal';
import type { BaseHandlerGroup } from '../../../lib/handlers/base/BaseHandlerGroup';
import { ReadOnlyHandlersGroup } from '../../../lib/handlers/groups/ReadOnlyHandlersGroup';
import { SearchHandlersGroup } from '../../../lib/handlers/groups/SearchHandlersGroup';
import { SystemHandlersGroup } from '../../../lib/handlers/groups/SystemHandlersGroup';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { notASearchType } from '../../../lib/searchTypes';
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

/** A connection declared cloud that answers every request 200, empty. */
function cloudConnection() {
  const connection = {
    getBaseUrl: async () => 'https://system.example.invalid',
    makeAdtRequest: async () => ({ status: 200, data: '' }),
  };
  declareSystemKind(connection, 'cloud');
  return connection;
}

const CLOUD_ONLY = 'SIA1';
const REFUSED = notASearchType('object_type', CLOUD_ONLY);

const CALLS = [
  ['SearchObject', { object_name: 'Z*', object_type: CLOUD_ONLY }],
  [
    'HandlerSystem',
    { action: 'search_object', object_name: 'Z*', object_type: CLOUD_ONLY },
  ],
] as const;

const textOf = (answer: { content?: Array<{ text?: string }> }): string =>
  (answer.content ?? []).map((c) => c.text ?? '').join('\n');

function groups(context: HandlerContext): BaseHandlerGroup[] {
  return [
    new ReadOnlyHandlersGroup(context),
    new SearchHandlersGroup(context),
    new SystemHandlersGroup(context),
    new CompactReadOnlyHandlersGroup(context),
  ];
}

async function clientOn(server: McpServer | EmbeddableMcpServer) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'recorded-kind', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

/** Read on cloud: neither refused for its kind nor for its type. */
function readOnCloud(text: string): void {
  expect(text).not.toContain('system_type_required');
  expect(text).not.toContain(SYSTEM_TYPE_REQUIRED_WORDS);
  expect(text).not.toContain(REFUSED);
}

it.each(CALLS)(
  'a plain registration stating no kind keeps the connection’s: %s',
  async (tool, args) => {
    const connection = cloudConnection();
    const context = {
      connection,
      logger: undefined,
    } as unknown as HandlerContext;
    const group = groups(context).find((g) =>
      g.getHandlers().some((e) => e.toolDefinition.name === tool),
    );
    const entry = group
      ?.getHandlers()
      .find((e) => e.toolDefinition.name === tool);
    if (group === undefined || entry === undefined) throw new Error(tool);
    const server = new McpServer({ name: 'plain', version: '1.0.0' });
    group.registerOneTool(server, entry, async () => context);
    const client = await clientOn(server);
    try {
      readOnCloud(
        textOf(
          (await client.callTool({ name: tool, arguments: args })) as {
            content?: Array<{ text?: string }>;
          },
        ),
      );
    } finally {
      await client.close();
    }
  },
);

it('an exporter stating no kind keeps the connection’s: SearchObject', async () => {
  const connection = cloudConnection();
  const entry = new HandlerExporter()
    .getHandlerEntries()
    .find((e) => e.toolDefinition.name === 'SearchObject');
  if (entry === undefined) throw new Error('SearchObject');
  const text = await entry
    .call({ connection, logger: undefined } as never, CALLS[0][1])
    .then(
      (answer) => textOf(answer),
      (error: Error) => error.message,
    );
  readOnCloud(text);
});

it.each(CALLS)(
  'the server: SAP_SYSTEM_TYPE does not override the connection’s kind: %s',
  async (tool, args) => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    const connection = cloudConnection();
    const placeholder = {
      connection: null,
      logger: undefined,
    } as unknown as HandlerContext;
    const server = new EmbeddableMcpServer({
      connection: connection as never,
      handlersRegistry: new CompositeHandlersRegistry(groups(placeholder)),
    });
    const client = await clientOn(server);
    try {
      readOnCloud(
        textOf(
          (await client.callTool({
            name: tool,
            arguments: { ...args, background: false },
          })) as { content?: Array<{ text?: string }> },
        ),
      );
    } finally {
      await client.close();
    }
  },
);
