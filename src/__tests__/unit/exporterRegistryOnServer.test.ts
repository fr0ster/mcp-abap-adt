/**
 * A `createRegistry()` registry takes its hosting server's options (D26 E8,
 * the owner's Q10 (c)): on a server, the server's `systemType` decides the
 * tools listed, whatever the exporter states — the exporter's `systemType`
 * applies to its own paths (`getHandlerEntries()`, `registerOnServer`).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { EmbeddableMcpServer } from '../../embeddable/EmbeddableMcpServer';
import { HandlerExporter } from '../../lib/handlers/HandlerExporter';

async function listed(
  serverKind: 'onprem' | 'cloud',
  exporterKind: 'onprem' | 'cloud',
): Promise<string[]> {
  const server = new EmbeddableMcpServer({
    connection: {} as never,
    systemType: serverKind,
    handlersRegistry: new HandlerExporter({
      systemType: exporterKind,
    }).createRegistry(),
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'kinds', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    return (await client.listTools()).tools.map((tool) => tool.name).sort();
  } finally {
    await client.close();
  }
}

it("the server's systemType decides the listing, not the exporter's", async () => {
  const onpremServer = await listed('onprem', 'cloud');
  expect(onpremServer).toEqual(await listed('onprem', 'onprem'));
  const cloudServer = await listed('cloud', 'onprem');
  expect(cloudServer).toEqual(await listed('cloud', 'cloud'));
  expect(onpremServer).not.toEqual(cloudServer);
});
