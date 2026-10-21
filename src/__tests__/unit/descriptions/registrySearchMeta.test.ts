/**
 * A registry that registers its own tools (an embedder's, not a handler
 * group): each tool the search table names carries
 * `_meta["mcp-abap-adt/search"]` in `tools/list`, in either registration
 * form (`registerTool`, `tool`), on an instance with a batch owner and on
 * one without; a tool the table does not name carries none.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { InstanceBatch } from '../../../lib/batch/InstanceBatch';
import type { IHandlersRegistry } from '../../../lib/handlers/interfaces';
import { TOOL_SEARCH_META_KEY, toolSearchText } from '../../../lib/toolSearch';

const silent = { info() {}, debug() {}, warn() {}, error() {} };

/** Registers GetDdl through `registerTool`, GetClass through `tool`, and a tool of its own. */
const ownRegistry: IHandlersRegistry = {
  registerAllTools(server: McpServer) {
    const answer = async () => ({
      content: [{ type: 'text' as const, text: 'ok' }],
    });
    server.registerTool(
      'GetDdl',
      { description: 'Reads a CDS view.', _meta: { 'vendor/own': 1 } },
      answer,
    );
    server.tool('GetClass', 'Reads a class.', answer);
    server.registerTool(
      'OwnTool',
      { description: 'Does its own thing.' },
      answer,
    );
  },
  registerTool() {},
  getRegisteredTools: () => ['GetDdl', 'GetClass', 'OwnTool'],
};

class RegistryServer extends BaseMcpServer {
  constructor(withBatch: boolean) {
    super({
      name: 'registry-search-meta',
      version: '1.0.0',
      logger: silent as never,
      ...(withBatch
        ? { batch: new InstanceBatch({ keepRawParts: false }) }
        : {}),
    });
    this.registerHandlers(ownRegistry);
  }
}

async function listed(withBatch: boolean) {
  const server = new RegistryServer(withBatch);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'registry', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const { tools } = await client.listTools();
  await client.close();
  return new Map(tools.map((tool) => [tool.name, tool._meta]));
}

describe("a registry's own tools carry their search texts", () => {
  it.each([
    ['without a batch owner', false],
    ['with a batch owner', true],
  ])('%s', async (_label, withBatch) => {
    const meta = await listed(withBatch);
    for (const name of ['GetDdl', 'GetClass']) {
      const text = toolSearchText(name);
      expect(meta.get(name)?.[TOOL_SEARCH_META_KEY]).toEqual({
        keywords: text?.keywords,
        semantic: text?.semantic,
      });
    }
    // What the registry gave its tool stays beside it.
    expect(meta.get('GetDdl')?.['vendor/own']).toBe(1);
    expect(meta.get('OwnTool')?.[TOOL_SEARCH_META_KEY]).toBeUndefined();
  });
});
