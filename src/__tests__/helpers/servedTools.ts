/**
 * The tools every binary serves, read as a client reads them (`tools/list`):
 * each of the twelve binaries' servers — stdio over an in-memory transport,
 * SSE over a real SSE stream, Streamable HTTP over real HTTP — per declared
 * system type (`SAP_SYSTEM_TYPE`, which a launcher requires).
 *
 * `listBinaries` is what the listed-schema test compares with its fixture
 * (every system type, `legacy` included); `servedTools` is what the coverage
 * guard derives its required keys from (the on-premise and cloud variants,
 * the two system kinds a live run reaches).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryBackgroundRuns } from '../../../background-runs-memory/src/InMemoryBackgroundRuns';
import { compactToolSet as compactStdioSet } from '../../../compact/src/launcher';
import { compactToolSet as compactHttpSet } from '../../../compact-http/src/launcher';
import { readOnlyToolSet as compactHttpRoSet } from '../../../compact-http-ro/src/launcher';
import { readOnlyToolSet as compactRoSet } from '../../../compact-ro/src/launcher';
import { compactToolSet as compactSseSet } from '../../../compact-sse/src/launcher';
import { readOnlyToolSet as compactSseRoSet } from '../../../compact-sse-ro/src/launcher';
import { readOnlyToolSet as coreRoSet } from '../../../core-ro/src/launcher';
import { readOnlyToolSet as httpRoSet } from '../../../http-ro/src/launcher';
import { StreamableHttpServer } from '../../../server-runtime/src/http/StreamableHttpServer';
import { SseServer } from '../../../server-runtime/src/sse/SseServer';
import { StdioServer } from '../../../server-runtime/src/stdio/StdioServer';
import { readOnlyToolSet as sseRoSet } from '../../../sse-ro/src/launcher';
import { resetProcessLatchForTests } from '../../lib/activeTools';
import { InstanceBatch } from '../../lib/batch/InstanceBatch';
import {
  BINARIES,
  fullToolSet,
  registryOf,
  type ServedTransport,
  type ToolSet,
  type ToolSetKind,
} from '../../lib/toolSet';
import { type AdtStandIn, adtStandIn } from './adtStandIn';

/** The system kinds a live run reaches: the on-premise system and the BTP trial. */
export type SystemKind = 'onprem' | 'cloud';

/** Every declared system type a binary lists for. */
export type SystemType = SystemKind | 'legacy';

/** A tool's input schema as `tools/list` answers it. */
export type ListedSchema = Tool['inputSchema'];

/** One tool as `tools/list` answers it. */
export type ListedTool = Tool;

/** One tool one binary serves on one variant. */
export interface ServedTool {
  name: string;
  variant: SystemKind;
  binary: string;
  schema: ListedSchema;
}

/** One server's listing: which binary, on which declared system type. */
export interface Listing {
  readonly systemType: SystemType;
  readonly bin: string;
  readonly tools: readonly ListedTool[];
}

export const TRANSPORTS: readonly ServedTransport[] = ['stdio', 'http', 'sse'];
export const KINDS: readonly ToolSetKind[] = [
  'core',
  'core-ro',
  'compact',
  'compact-ro',
];

/** Each binary's own tool set, as its command hands it to `main`. */
export const toolSets: Record<ServedTransport, Record<ToolSetKind, ToolSet>> = {
  stdio: {
    core: fullToolSet,
    'core-ro': coreRoSet,
    compact: compactStdioSet,
    'compact-ro': compactRoSet,
  },
  http: {
    core: fullToolSet,
    'core-ro': httpRoSet,
    compact: compactHttpSet,
    'compact-ro': compactHttpRoSet,
  },
  sse: {
    core: fullToolSet,
    'core-ro': sseRoSet,
    compact: compactSseSet,
    'compact-ro': compactSseRoSet,
  },
};

const sapHeaders = (url: string): Record<string, string> => ({
  'x-sap-url': url,
  'x-sap-client': '100',
  'x-sap-login': 'SURFACE_USER',
  'x-sap-password': 'surface-password',
});

/** The port a started server listens on: port 0 asked, the system's choice read back. */
function boundPort(server: { listeningPort(): number | undefined }): number {
  const port = server.listeningPort();
  if (port === undefined) throw new Error('the server listens on no port');
  return port;
}

async function listOver(
  transport: Parameters<Client['connect']>[0],
): Promise<ListedTool[]> {
  const client = new Client({ name: 'listed-schemas', version: '1' });
  await client.connect(transport);
  try {
    return (await client.listTools()).tools;
  } finally {
    await client.close();
  }
}

/** The background-run store a launcher hands over where its set serves runs. */
const backgroundRunsOf = (toolSet: ToolSet) =>
  toolSet.backgroundRuns
    ? { backgroundRuns: new InMemoryBackgroundRuns() }
    : {};

async function stdioTools(kind: ToolSetKind): Promise<ListedTool[]> {
  const toolSet = toolSets.stdio[kind];
  const server = new StdioServer(
    registryOf(toolSet, 'stdio', { dataTools: true }),
    undefined,
    {
      batch: new InstanceBatch({ keepRawParts: false }),
      ...backgroundRunsOf(toolSet),
    },
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.start(undefined, serverSide);
  return listOver(clientSide);
}

async function sseTools(
  kind: ToolSetKind,
  standIn: AdtStandIn,
): Promise<ListedTool[]> {
  const toolSet = toolSets.sse[kind];
  const sse = new SseServer(registryOf(toolSet, 'sse', { dataTools: true }), {
    host: '127.0.0.1',
    port: 0,
    batch: { keepRawParts: false },
    ...backgroundRunsOf(toolSet),
  });
  await sse.start();
  const port = boundPort(sse);
  const headers = sapHeaders(standIn.url);
  try {
    return await listOver(
      new SSEClientTransport(new URL(`http://127.0.0.1:${port}/sse`), {
        requestInit: { headers },
        eventSourceInit: {
          fetch: (url, init) =>
            fetch(url, {
              ...init,
              headers: { ...(init?.headers ?? {}), ...headers },
            }),
        },
      }),
    );
  } finally {
    await sse.stop();
  }
}

async function httpTools(
  kind: ToolSetKind,
  standIn: AdtStandIn,
): Promise<ListedTool[]> {
  const toolSet = toolSets.http[kind];
  const mcp = new StreamableHttpServer(
    registryOf(toolSet, 'http', { dataTools: true }),
    {
      host: '127.0.0.1',
      port: 0,
      batch: { keepRawParts: false },
      ...backgroundRunsOf(toolSet),
    },
  );
  await mcp.start();
  const port = boundPort(mcp);
  try {
    return await listOver(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${port}/mcp/stream/http`),
        { requestInit: { headers: sapHeaders(standIn.url) } },
      ),
    );
  } finally {
    await mcp.stop();
  }
}

/**
 * The listing of every binary (the four kinds on the three transports) on
 * each of `systemTypes`, each declared through `SAP_SYSTEM_TYPE` as a
 * launcher reads it. The caller restores `SAP_SYSTEM_TYPE` afterwards.
 */
export async function listBinaries(
  systemTypes: readonly SystemType[],
  standIn: AdtStandIn,
): Promise<Listing[]> {
  const listings: Listing[] = [];
  for (const systemType of systemTypes) {
    process.env.SAP_SYSTEM_TYPE = systemType;
    for (const kind of KINDS) {
      for (const transport of TRANSPORTS) {
        const tools =
          transport === 'stdio'
            ? await stdioTools(kind)
            : transport === 'sse'
              ? await sseTools(kind, standIn)
              : await httpTools(kind, standIn);
        listings.push({
          systemType,
          bin: BINARIES[transport][kind].bin,
          tools,
        });
      }
    }
  }
  return listings;
}

const SYSTEM_KINDS: readonly SystemKind[] = ['onprem', 'cloud'];

/**
 * `tools/list` of all twelve binaries on both variants, `onprem` and
 * `cloud`: one entry per tool, binary and variant. Restores
 * `SAP_SYSTEM_TYPE` and the process latch as it found them.
 */
export async function servedTools(): Promise<readonly ServedTool[]> {
  const saved = process.env.SAP_SYSTEM_TYPE;
  resetProcessLatchForTests();
  const standIn = await adtStandIn();
  try {
    const served: ServedTool[] = [];
    for (const variant of SYSTEM_KINDS) {
      for (const { bin, tools } of await listBinaries([variant], standIn)) {
        for (const tool of tools) {
          served.push({
            name: tool.name,
            variant,
            binary: bin,
            schema: tool.inputSchema,
          });
        }
      }
    }
    return served;
  } finally {
    await standIn.close();
    if (saved === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = saved;
    resetProcessLatchForTests();
  }
}
