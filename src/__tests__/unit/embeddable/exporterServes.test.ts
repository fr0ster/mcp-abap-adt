/**
 * `HandlerExporter` leaves out what it cannot serve, on every path it hands
 * tools out by (`getToolNames` / `getHandlerEntries`, `createRegistry()`
 * registered on a plain `McpServer`, `registerOnServer`): it keeps no
 * background-run store and no debugger, so the background-run tools, the
 * debugger tools and the run tools' `background` parameter are not there,
 * and its options have no `includeDebug` (a typecheck case:
 * src/__tests__/typecheck/handlerExporterGuide.typecheck.ts).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BackgroundRunHandlersGroup } from '../../../lib/handlers/groups/BackgroundRunHandlersGroup';
import { DebugHandlersGroup } from '../../../lib/handlers/groups/DebugHandlersGroup';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import type { SapEnvironment } from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import { countingConnection } from '../../helpers/batchHarness';
import { listedJson } from '../../helpers/listedJson';

/** The memory snapshot reads: the readonly group serves them too. */
const SNAPSHOT_READS = [
  'MemorySnapshotList',
  'MemorySnapshotGet',
  'MemorySnapshotDelta',
];
const LEFT_OUT = [
  ...new BackgroundRunHandlersGroup(noConnectionContext()).getHandlers(),
  ...new DebugHandlersGroup(noConnectionContext()).getHandlers(),
]
  .map((entry) => entry.toolDefinition.name)
  .filter((name) => !SNAPSHOT_READS.includes(name));
const RUN_TOOLS = ['RuntimeRunClass', 'RuntimeRunProgram'];

/** What a tool is handed out or listed with: its name and schema. */
interface Shown {
  readonly name: string;
  readonly inputSchema: {
    readonly properties?: Record<string, unknown> | undefined;
  };
}

async function listed(server: McpServer): Promise<Shown[]> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'exporter-serves', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    return (await client.listTools()).tools;
  } finally {
    await client.close();
  }
}

const exporterFor = (systemType?: SapEnvironment) =>
  new HandlerExporter(systemType !== undefined ? { systemType } : {});

const PATHS: Readonly<
  Record<string, (systemType?: SapEnvironment) => Promise<Shown[]>>
> = {
  getHandlerEntries: async (systemType) =>
    exporterFor(systemType)
      .getHandlerEntries()
      .map((entry) => ({
        name: entry.toolDefinition.name,
        inputSchema: listedJson(entry.toolDefinition.inputSchema),
      })),
  'createRegistry().registerAllTools': (systemType) => {
    const server = new McpServer({ name: 'plain', version: '1.0.0' });
    exporterFor(systemType).createRegistry().registerAllTools(server);
    return listed(server);
  },
  registerOnServer: (systemType) => {
    const server = new McpServer({ name: 'embedder', version: '1.0.0' });
    const { connection } = countingConnection('document', undefined);
    exporterFor(systemType).registerOnServer(server, () => connection);
    return listed(server);
  },
};

for (const [_path, shown] of Object.entries(PATHS)) {
  describe(format('HandlerExporter %s', _path), () => {
    for (const systemType of [
      'onprem',
      'cloud',
      undefined,
    ] satisfies ReadonlyArray<SapEnvironment | undefined>) {
      it(
        format(
          'where %s is stated: no background-run or debugger tool, run tools without background',
          systemType,
        ),
        async () => {
          const tools = await shown(systemType);
          const names = tools.map((tool) => tool.name);
          // Not vacuous: a run tool is there to look at (cloud lists the class run alone).
          assert.ok(names.includes('RuntimeRunClass'));
          assert.deepStrictEqual(
            names.filter((name) => LEFT_OUT.includes(name)),
            [],
          );
          for (const tool of tools.filter((t) => RUN_TOOLS.includes(t.name))) {
            assert.ok(
              !Object.keys(tool.inputSchema.properties ?? {}).includes(
                'background',
              ),
            );
            assert.ok(
              Object.keys(tool.inputSchema.properties ?? {}).includes(
                'profile',
              ),
            );
          }
        },
      );
    }
  });
}

describe('HandlerExporter getToolNames', () => {
  it('names no background-run or debugger tool', () => {
    assert.deepStrictEqual(
      exporterFor('onprem')
        .getToolNames()
        .filter((name) => LEFT_OUT.includes(name)),
      [],
    );
    {
      const actual = LEFT_OUT;
      for (const expected of ['GetBackgroundRun', 'DebugStartListener']) {
        assert.ok(actual.some((e) => isDeepStrictEqual(e, expected)));
      }
    }
  });
});
