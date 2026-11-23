/**
 * abapGit tools are served by the MCP server only: their calls need
 * `BaseMcpServer`'s admission (spec §4.4), and without it every call is
 * refused `abapgit_not_admitted`. So `HandlerExporter` hands out none — on
 * `getHandlerEntries()`, `getToolNames()`, `createRegistry()` and
 * `registerOnServer` — whatever its options state.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { isAbapGitTool } from '../../../lib/abapGit/tools';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import type { SapEnvironment } from '../../../lib/handlers/interfaces';
import { noConnection } from '../../../lib/handlers/noConnection';

const KINDS: ReadonlyArray<SapEnvironment | undefined> = [
  'onprem',
  'cloud',
  undefined,
];

const exporterFor = (systemType: SapEnvironment | undefined) =>
  new HandlerExporter({
    includeData: true,
    ...(systemType !== undefined && { systemType }),
  });

describe('HandlerExporter hands out no abapGit tool', () => {
  for (const systemType of KINDS) {
    const kind = systemType ?? 'no kind';

    it(`getToolNames and getHandlerEntries, ${kind}`, () => {
      const exporter = exporterFor(systemType);
      const names = exporter.getToolNames();
      assert.ok(names.length > 15, 'the exporter lists its tools');
      assert.deepEqual(names.filter(isAbapGitTool), []);
    });

    it(`createRegistry's groups, ${kind}`, () => {
      const names = exporterFor(systemType)
        .createRegistry()
        .getHandlerGroups()
        .flatMap((group) => group.getHandlers())
        .map((entry) => entry.toolDefinition.name);
      assert.ok(names.length > 15, 'the registry holds its tools');
      assert.deepEqual(names.filter(isAbapGitTool), []);
    });

    it(`registerOnServer lists none, ${kind}`, async () => {
      const server = new McpServer({ name: 'exporter', version: '1' });
      exporterFor(systemType).registerOnServer(
        server,
        async () => noConnection,
      );
      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'exporter-client', version: '1' });
      await Promise.all([
        server.connect(serverSide),
        client.connect(clientSide),
      ]);
      try {
        const names = (await client.listTools()).tools.map((tool) => tool.name);
        assert.ok(names.length > 15, 'the server lists the tools');
        assert.deepEqual(names.filter(isAbapGitTool), []);
      } finally {
        await client.close();
        await server.close();
      }
    });
  }
});
