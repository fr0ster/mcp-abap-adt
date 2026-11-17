/**
 * The data tools are off for embedders too (spec §4): `EmbeddableMcpServer`
 * lists them only when its `exposition` names `data`, `registryForExposition`
 * serves them only for `data`, `HandlerExporter` hands them out only with
 * `includeData: true`, and the compact read-only group carries no
 * `HandlerGetData` — `CompactDataHandlersGroup` does.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import {
  CompactDataHandlersGroup,
  CompactReadOnlyHandlersGroup,
} from '@mcp-abap-adt/compact-readonly-entries';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { noopLogger } from '../../../lib/handlerLogger';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import type { IHandlerGroup } from '../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  noConnectionContext,
  registryForExposition,
} from '../../../lib/handlers/registry/expositionRegistry';

const FULL_DATA = ['GetSqlQuery', 'GetTableContents'];
const COMPACT_DATA = ['HandlerGetData'];

/** A connection the listing never uses: nothing is called on it. */
const unconnected = () =>
  createAbapConnection(
    { url: 'http://127.0.0.1:9', client: '100', authType: 'basic' },
    new BasicAuthProvider('LIST_USER', 'list-password'),
    undefined,
    undefined,
    undefined,
    'onprem',
  );

const dataIn = (names: readonly string[], data: readonly string[]) =>
  names.filter((name) => data.includes(name)).sort();

const namesOfGroups = (groups: readonly IHandlerGroup[]) =>
  groups.flatMap((group) =>
    group.getHandlers().map((entry) => entry.toolDefinition.name),
  );

/** The tool names a client of `server` sees. */
async function listedBy(
  server: EmbeddableMcpServer | McpServer,
): Promise<string[]> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'data-tools', version: '1' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    return (await client.listTools()).tools.map((tool) => tool.name);
  } finally {
    await client.close().catch(() => undefined);
  }
}

describe('EmbeddableMcpServer and the data tools', () => {
  it('lists none with the default exposition', async () => {
    const server = new EmbeddableMcpServer({
      connection: unconnected(),
      systemType: 'onprem',
      logger: noopLogger,
    });
    assert.deepEqual(dataIn(await listedBy(server), FULL_DATA), []);
  });

  it('lists both when the exposition names data', async () => {
    const server = new EmbeddableMcpServer({
      connection: unconnected(),
      systemType: 'onprem',
      logger: noopLogger,
      exposition: ['readonly', 'high', 'data'],
    });
    assert.deepEqual(dataIn(await listedBy(server), FULL_DATA), FULL_DATA);
  });
});

describe('registryForExposition and the data tools', () => {
  it('serves none without data', () => {
    assert.deepEqual(
      dataIn(
        namesOfGroups(
          registryForExposition(['readonly', 'high']).getHandlerGroups(),
        ),
        FULL_DATA,
      ),
      [],
    );
  });

  it('serves both with data', () => {
    assert.deepEqual(
      dataIn(
        namesOfGroups(
          registryForExposition(['readonly', 'data']).getHandlerGroups(),
        ),
        FULL_DATA,
      ),
      FULL_DATA,
    );
  });
});

describe('HandlerExporter and the data tools', () => {
  const exporter = (includeData?: boolean) =>
    new HandlerExporter({
      systemType: 'onprem',
      ...(includeData !== undefined && { includeData }),
    });

  /** What a plain registration of the exporter's registry lists. */
  const registryNames = async (includeData?: boolean) => {
    const server = new McpServer({ name: 'exporter', version: '1' });
    exporter(includeData).createRegistry().registerAllTools(server);
    return listedBy(server);
  };

  it('hands out none without includeData', async () => {
    assert.deepEqual(dataIn(exporter().getToolNames(), FULL_DATA), []);
    assert.deepEqual(dataIn(await registryNames(), FULL_DATA), []);
  });

  it('hands out none with includeData: false', () => {
    assert.deepEqual(dataIn(exporter(false).getToolNames(), FULL_DATA), []);
  });

  it('hands out both with includeData: true, as entries and in its registry', async () => {
    assert.deepEqual(
      dataIn(exporter(true).getToolNames(), FULL_DATA),
      FULL_DATA,
    );
    assert.deepEqual(dataIn(await registryNames(true), FULL_DATA), FULL_DATA);
  });
});

describe('the compact groups and the data tool', () => {
  it('a registry of the compact read-only group alone lists no HandlerGetData', async () => {
    const server = new McpServer({ name: 'compact', version: '1' });
    new CompositeHandlersRegistry([
      new CompactReadOnlyHandlersGroup(noConnectionContext()),
    ]).registerAllTools(server);
    assert.deepEqual(dataIn(await listedBy(server), COMPACT_DATA), []);
  });

  it('with CompactDataHandlersGroup it does', async () => {
    const server = new McpServer({ name: 'compact', version: '1' });
    new CompositeHandlersRegistry([
      new CompactReadOnlyHandlersGroup(noConnectionContext()),
      new CompactDataHandlersGroup(noConnectionContext()),
    ]).registerAllTools(server);
    assert.deepEqual(
      dataIn(await listedBy(server), COMPACT_DATA),
      COMPACT_DATA,
    );
  });
});
