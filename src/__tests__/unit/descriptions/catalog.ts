/**
 * The served tool catalogs, as a client's `tools/list` returns them: name,
 * description (with the sentence appended at registration), parameter
 * names and the search texts of `_meta`, per set, from a `BaseMcpServer` with a batch owner.
 */
import { compactModifyEntries } from '@mcp-abap-adt/compact-modify';
import { compactReadOnlyEntries } from '@mcp-abap-adt/compact-readonly-entries';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { InstanceBatch } from '../../../lib/batch/InstanceBatch';
import type { ToolSetKind } from '../../../lib/config/binaries';
import type { IHandlersRegistry } from '../../../lib/handlers/interfaces';
import {
  compactReadOnlyToolSetOf,
  compactToolSetOf,
  fullReadOnlyToolSet,
  fullToolSet,
  registryOf,
  type ServedTransport,
  type ToolSet,
} from '../../../lib/toolSet';

export type SystemType = 'onprem' | 'cloud' | 'legacy';

/** One tool as `tools/list` serves it. */
export interface ServedTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: readonly string[];
  /** The search texts `tools/list` carries under `_meta["mcp-abap-adt/search"]`. */
  readonly search: { keywords: string[]; semantic: string } | undefined;
}

export const SETS: ReadonlyArray<readonly [ToolSetKind, ToolSet]> = [
  ['core', fullToolSet],
  ['core-ro', fullReadOnlyToolSet],
  [
    'compact',
    compactToolSetOf({
      readOnly: compactReadOnlyEntries,
      modify: compactModifyEntries,
    }),
  ],
  ['compact-ro', compactReadOnlyToolSetOf(compactReadOnlyEntries)],
];

/** The set of `kind`. */
export function setOf(kind: ToolSetKind): ToolSet {
  for (const [each, set] of SETS) if (each === kind) return set;
  throw new Error(`no tool set ${kind}`);
}

export const TRANSPORTS: readonly ServedTransport[] = ['stdio', 'http', 'sse'];
export const SYSTEM_TYPES: readonly SystemType[] = [
  'onprem',
  'cloud',
  'legacy',
];

const silent = { info() {}, debug() {}, warn() {}, error() {} };

class CatalogServer extends BaseMcpServer {
  constructor(registry: IHandlersRegistry, systemType: SystemType) {
    super({
      name: 'tool-catalog',
      version: '1.0.0',
      logger: silent as never,
      systemType,
      batch: new InstanceBatch({ keepRawParts: false }),
    });
    this.registerHandlers(registry);
  }
}

/** What a client of `set` over `transport` on `systemType` lists. */
export async function servedCatalog(
  set: ToolSet,
  transport: ServedTransport = 'stdio',
  systemType: SystemType = 'onprem',
): Promise<ServedTool[]> {
  const server = new CatalogServer(registryOf(set, transport), systemType);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'tool-catalog', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    parameters: Object.keys(
      (tool.inputSchema as { properties?: Record<string, unknown> })
        .properties ?? {},
    ),
    search: (tool._meta as Record<string, unknown> | undefined)?.[
      'mcp-abap-adt/search'
    ] as ServedTool['search'],
  }));
}
