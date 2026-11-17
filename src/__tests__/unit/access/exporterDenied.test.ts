/**
 * `HandlerExporter` takes the denied actions (spec §3.1): a denied tool is
 * in none of its paths — `getHandlerEntries()`, `getToolNames()`,
 * `registerOnServer()` — and every other exported definition is unchanged;
 * a `Tool.value` entry on a full-set tool matches nothing.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { parseDeniedEntry } from '../../../lib/access/deniedActions';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import { listedJson } from '../../helpers/listedJson';
import { parityConnection } from '../../helpers/lowToCompact';

const DENIED = [
  parseDeniedEntry('GetPackage', 'test'),
  parseDeniedEntry('GetClass.CLASS', 'test'),
];

/** The tool names a client lists from a server the exporter registered on. */
async function listedNames(exporter: HandlerExporter): Promise<string[]> {
  const server = new McpServer({ name: 'exporter', version: '1' });
  exporter.registerOnServer(server, () => parityConnection());
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'exporter-client', version: '1' });
  await client.connect(clientSide);
  try {
    return (await client.listTools()).tools.map((tool) => tool.name);
  } finally {
    await client.close();
    await server.close();
  }
}

describe('HandlerExporter with deniedActions', () => {
  const denied = new HandlerExporter({ deniedActions: DENIED });
  const plain = new HandlerExporter();

  it('leaves the denied tool out of every path', async () => {
    assert.equal(
      denied
        .getHandlerEntries()
        .some((entry) => entry.toolDefinition.name === 'GetPackage'),
      false,
    );
    assert.equal(denied.getToolNames().includes('GetPackage'), false);
    assert.ok(plain.getToolNames().includes('GetPackage'));
    const listed = await listedNames(denied);
    assert.equal(listed.includes('GetPackage'), false);
    assert.ok(listed.includes('GetClass'));
  });

  it('hands out every other definition unchanged', () => {
    const stated = (exporter: HandlerExporter) =>
      Object.fromEntries(
        exporter.getHandlerEntries().map((entry) => [
          entry.toolDefinition.name,
          {
            description: entry.toolDefinition.description,
            inputSchema: listedJson(entry.toolDefinition.inputSchema),
          },
        ]),
      );
    const { GetPackage: _left, ...others } = stated(plain);
    assert.deepEqual(stated(denied), others);
  });
});
