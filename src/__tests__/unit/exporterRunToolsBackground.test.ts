/**
 * The run tools through `createRegistry()` (D26 E10). Measured on the
 * stand-in first: on a server with `backgroundRuns` the long reads listed
 * `background` and `RuntimeRunClass` did not — the exporter stripped it from
 * the run group it hands every path. A `createRegistry()` registry runs in
 * its hosting server, so its run tools follow the server's own rule:
 * `background` served with `backgroundRuns`, and without them listed as
 * the server's own run tools are (a `background: true` refused
 * `background_runs_unavailable`, `backgroundRuns/` suites). A plain
 * registration and `getHandlerEntries()` keep no runs: without it.
 */

import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { EmbeddableMcpServer } from '../../embeddable/EmbeddableMcpServer';
import { HandlerExporter } from '../../lib/handlers/HandlerExporter';

/** Whether `RuntimeRunClass`, as `server` lists it, declares `background`. */
async function runClassBackground(server: EmbeddableMcpServer) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'runs', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    const { tools } = await client.listTools();
    const run = tools.find((tool) => tool.name === 'RuntimeRunClass');
    expect(run).toBeDefined();
    return Object.keys(run?.inputSchema.properties ?? {}).includes(
      'background',
    );
  } finally {
    await client.close();
  }
}

const exporter = () => new HandlerExporter({ systemType: 'onprem' });

it('createRegistry() on a server with backgroundRuns lists RuntimeRunClass with background', async () => {
  const server = new EmbeddableMcpServer({
    connection: {} as never,
    systemType: 'onprem',
    handlersRegistry: exporter().createRegistry(),
    backgroundRuns: new InMemoryBackgroundRuns(),
  });
  expect(await runClassBackground(server)).toBe(true);
});

it('without backgroundRuns: as the server lists its own run tools (background: true is refused in words there)', async () => {
  const own = new EmbeddableMcpServer({
    connection: {} as never,
    systemType: 'onprem',
    exposition: ['system'],
  });
  const exported = new EmbeddableMcpServer({
    connection: {} as never,
    systemType: 'onprem',
    handlersRegistry: exporter().createRegistry(),
  });
  expect(await runClassBackground(exported)).toBe(
    await runClassBackground(own),
  );
});

it('getHandlerEntries() hands RuntimeRunClass out without background', () => {
  const entry = exporter()
    .getHandlerEntries()
    .find((e) => e.toolDefinition.name === 'RuntimeRunClass');
  expect(
    Object.keys(entry?.toolDefinition.inputSchema.shape ?? {}),
  ).not.toContain('background');
});
