/**
 * What each tool-surface fixture holds, rendered as its `WRITE_*` mode
 * writes it: `listed-schemas.json` (`listedSchemas.test.ts`),
 * `variant-surface.json` (`variantSurface.test.ts`), `http-surface.json`
 * and `stdio-sse-surface.json` (`transportSurface.test.ts`). Those tests
 * and the byte test (`unit/toolSet/fixtureBytes.test.ts`) read them from
 * here, so the bytes a fixture is compared with are the bytes its writer
 * writes. Reaches no Jest global: the node:test build compiles it.
 */

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
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
import type { SapEnvironment } from '../../lib/handlers/interfaces';
import { TOOL_SEARCH_META_KEY } from '../../lib/toolSearch';
import {
  BINARIES,
  fullToolSet,
  registryOf,
  type ServedTransport,
  type ToolSet,
  type ToolSetKind,
} from '../../lib/toolSet';
import type { AdtStandIn } from './adtStandIn';
import { argumentSchema, PROJECTED_ARGUMENTS } from './projectedArguments';
import type { ListedTool, Listing } from './servedTools';

// ---- listed-schemas.json ----

/** One distinct listed value of a tool, and every `<system type> <binary>` listing it. */
export interface Listed {
  readonly listedBy: string[];
  readonly value: unknown;
}

/** Tool → its distinct listed values, in listing order. */
export type Grouped = Record<string, Listed[]>;

/** `value[key]` when `value` is an object, read as data from outside the types. */
export function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** The keys of `value` when it is an object, `[]` else. */
export const keysOf = (value: unknown): string[] =>
  typeof value === 'object' && value !== null ? Object.keys(value) : [];

export const searchOf = (tool: ListedTool): unknown =>
  tool._meta?.[TOOL_SEARCH_META_KEY];

/**
 * Tool → each distinct value `pick` reads from it, with every listing that
 * lists that value: the listings of all binaries on all system types, each
 * tool's values once. Tools sorted by name; values in listing order.
 */
export function grouped(
  listings: readonly Listing[],
  pick: (tool: ListedTool) => unknown,
): Grouped {
  const byTool = new Map<string, Map<string, Listed>>();
  for (const { systemType, bin, tools } of listings) {
    for (const tool of tools) {
      const value = pick(tool);
      const key = JSON.stringify(value) ?? 'undefined';
      const values = byTool.get(tool.name) ?? new Map<string, Listed>();
      byTool.set(tool.name, values);
      const known = values.get(key);
      if (known === undefined) {
        values.set(key, { listedBy: [`${systemType} ${bin}`], value });
      } else {
        known.listedBy.push(`${systemType} ${bin}`);
      }
    }
  }
  return Object.fromEntries(
    [...byTool]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, values]) => [name, [...values.values()]]),
  );
}

/** A fixture: one line per distinct value of a tool, so a change reads as that line. */
export function renderListedSchemas(fixture: {
  schemas: Grouped;
  search: Grouped;
}): string {
  const section = (values: Grouped): string =>
    Object.entries(values)
      .map(([name, listed]) => {
        const lines = listed.map((each) => `      ${JSON.stringify(each)}`);
        return `    ${JSON.stringify(name)}: [\n${lines.join(',\n')}\n    ]`;
      })
      .join(',\n');
  return `{\n  "schemas": {\n${section(fixture.schemas)}\n  },\n  "search": {\n${section(fixture.search)}\n  }\n}\n`;
}

// ---- variant-surface.json ----

const VARIANT_SETS: Readonly<Record<ToolSetKind, ToolSet>> = {
  core: fullToolSet,
  'core-ro': coreRoSet,
  compact: compactStdioSet,
  'compact-ro': compactRoSet,
};

/** What one kind of binary registers for a variant. */
export interface KindSurface {
  /** The tools listed, sorted. */
  tools: string[];
  /**
   * `<tool>.<argument>` → the members its enum lists, in schema order, for
   * each argument projected from the tables (`PROJECTED_ARGUMENTS`).
   */
  members: Record<string, string[]>;
  /** `<tool>.<argument>` → its description, for the same arguments. */
  argumentDescriptions: Record<string, string>;
  /** The description of each tool with a projected argument. */
  descriptions: Record<string, string>;
  /** The properties each tool with a projected argument lists, in schema order. */
  properties: Record<string, string[]>;
}

export type VariantSurface = Record<
  SapEnvironment,
  Record<ToolSetKind, KindSurface>
>;

/** The members `argument` lists in a listed tool's schema, when it has any. */
function enumOf(inputSchema: unknown, argument: string): string[] | undefined {
  const property = argumentSchema(inputSchema, argument);
  if (typeof property !== 'object' || property === null) return;
  const listed: unknown = Reflect.get(property, 'enum');
  if (Array.isArray(listed)) return listed.map(String);
  // One member left is registered as a literal (`schemaUtils`): `const`.
  const only: unknown = Reflect.get(property, 'const');
  return typeof only === 'string' ? [only] : undefined;
}

async function surfaceOf(
  environment: SapEnvironment,
  kind: ToolSetKind,
): Promise<KindSurface> {
  process.env.SAP_SYSTEM_TYPE = environment;
  // As the launcher builds it: every set keeps background runs.
  const server = new StdioServer(
    registryOf(VARIANT_SETS[kind], 'stdio', { dataTools: true }),
    undefined,
    {
      backgroundRuns: new InMemoryBackgroundRuns(),
    },
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.start(undefined, serverSide);
  const client = new Client({ name: 'variant-surface', version: '1' });
  await client.connect(clientSide);
  try {
    const { tools } = await client.listTools();
    const members: Record<string, string[]> = {};
    const argumentDescriptions: Record<string, string> = {};
    const descriptions: Record<string, string> = {};
    const properties: Record<string, string[]> = {};
    for (const tool of tools) {
      for (const projected of PROJECTED_ARGUMENTS) {
        if (projected.tool !== tool.name) continue;
        const key = `${tool.name}.${projected.argument}`;
        const listed = enumOf(tool.inputSchema, projected.argument);
        if (listed !== undefined) members[key] = listed;
        const described: unknown = Reflect.get(
          Object(argumentSchema(tool.inputSchema, projected.argument)),
          'description',
        );
        if (typeof described === 'string') {
          argumentDescriptions[key] = described;
        }
        descriptions[tool.name] = tool.description ?? '';
        properties[tool.name] = Object.keys(tool.inputSchema.properties ?? {});
      }
    }
    const sorted = <T>(record: Record<string, T>): Record<string, T> =>
      Object.fromEntries(
        Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
      );
    return {
      tools: tools.map((tool) => tool.name).sort(),
      members: sorted(members),
      argumentDescriptions: sorted(argumentDescriptions),
      descriptions: sorted(descriptions),
      properties: sorted(properties),
    };
  } finally {
    await client.close();
  }
}

/** Every kind's surface for `environment`, one server each. */
async function kindsOf(
  environment: SapEnvironment,
): Promise<Record<ToolSetKind, KindSurface>> {
  return {
    core: await surfaceOf(environment, 'core'),
    'core-ro': await surfaceOf(environment, 'core-ro'),
    compact: await surfaceOf(environment, 'compact'),
    'compact-ro': await surfaceOf(environment, 'compact-ro'),
  };
}

export async function variantSurface(): Promise<VariantSurface> {
  return {
    onprem: await kindsOf('onprem'),
    cloud: await kindsOf('cloud'),
    legacy: await kindsOf('legacy'),
  };
}

// ---- http-surface.json, stdio-sse-surface.json ----

export type Schema = {
  type?: string;
  properties?: Record<string, { type?: string; description?: string }>;
  required?: string[];
  [key: string]: unknown;
};
export type Surface = Record<string, Record<string, Schema>>;

export const KINDS: readonly ToolSetKind[] = [
  'core',
  'core-ro',
  'compact',
  'compact-ro',
];

/** The long-session tools each kind of HTTP binary serves (spec §2). */
export const SESSION_TOOLS: Record<ToolSetKind, readonly string[]> = {
  core: ['SessionOpen', 'SessionClose'],
  'core-ro': ['SessionOpen', 'SessionClose'],
  compact: ['HandlerSession'],
  'compact-ro': ['HandlerSession'],
};

/** Each binary's own tool set, as its command hands it to `main`. */
const toolSets: Record<ServedTransport, Record<ToolSetKind, ToolSet>> = {
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

const sapHeaders = (url: string) => ({
  'x-sap-url': url,
  'x-sap-client': '100',
  'x-sap-login': 'SURFACE_USER',
  'x-sap-password': 'surface-password',
});

/** Tool name → input schema, sorted by name, as `tools/list` answers. */
function byName(
  tools: ReadonlyArray<{ name: string; inputSchema: unknown }>,
): Record<string, Schema> {
  const out: Record<string, Schema> = {};
  for (const tool of [...tools].sort((a, b) => a.name.localeCompare(b.name))) {
    out[tool.name] = tool.inputSchema as Schema;
  }
  return out;
}

async function listOver(
  client: Client,
  transport: Parameters<Client['connect']>[0],
): Promise<Record<string, Schema>> {
  await client.connect(transport);
  try {
    return byName((await client.listTools()).tools);
  } finally {
    await client.close();
  }
}

async function stdioSurface(
  kind: ToolSetKind,
): Promise<Record<string, Schema>> {
  // As the launcher builds it: every set keeps background runs.
  const server = new StdioServer(
    registryOf(toolSets.stdio[kind], 'stdio', { dataTools: true }),
    undefined,
    { backgroundRuns: new InMemoryBackgroundRuns() },
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.start(undefined, serverSide);
  return listOver(new Client({ name: 'surface', version: '1' }), clientSide);
}

async function sseSurface(
  kind: ToolSetKind,
  standIn: AdtStandIn,
): Promise<Record<string, Schema>> {
  const sse = new SseServer(
    registryOf(toolSets.sse[kind], 'sse', { dataTools: true }),
    {
      host: '127.0.0.1',
      port: 0,
      backgroundRuns: new InMemoryBackgroundRuns(),
    },
  );
  await sse.start();
  const listener = (sse as unknown as { standaloneServer: Server })
    .standaloneServer;
  const port = (listener.address() as AddressInfo).port;
  const headers = sapHeaders(standIn.url);
  try {
    return await listOver(
      new Client({ name: 'surface', version: '1' }),
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
    sse.stopListening();
    listener.closeAllConnections();
    // Settled once every stream's close has run, so none lands after the test.
    const open = (sse as unknown as { connections: Map<unknown, unknown> })
      .connections;
    while (open.size > 0) await new Promise((r) => setImmediate(r));
  }
}

async function httpSurface(
  kind: ToolSetKind,
  standIn: AdtStandIn,
): Promise<Record<string, Schema>> {
  const mcp = new StreamableHttpServer(
    registryOf(toolSets.http[kind], 'http', { dataTools: true }),
    {
      host: '127.0.0.1',
      port: 0,
      // As the launcher: batch mode on, so descriptions carry its sentence;
      // background runs kept.
      batch: { keepRawParts: false },
      backgroundRuns: new InMemoryBackgroundRuns(),
    },
  );
  await mcp.start();
  const listener = (mcp as unknown as { standaloneServer: Server })
    .standaloneServer;
  const port = (listener.address() as AddressInfo).port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/mcp/stream/http`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...sapHeaders(standIn.url),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    const raw = await response.text();
    if (response.status !== 200) {
      throw new Error(`tools/list answered ${response.status}`);
    }
    const json = raw.startsWith('{')
      ? raw
      : (raw
          .split('\n')
          .find((line) => line.startsWith('data: '))
          ?.slice('data: '.length) ?? '');
    const body = JSON.parse(json) as {
      result: { tools: { name: string; inputSchema: unknown }[] };
    };
    return byName(body.result.tools);
  } finally {
    mcp.stopListening();
    listener.closeAllConnections();
  }
}

export const binOf = (transport: ServedTransport, kind: ToolSetKind) =>
  BINARIES[transport][kind].bin;

/** `name*` for a required parameter, `name` for an optional one. */
export function inputsOf(schema: Schema): string {
  const required = new Set(schema.required ?? []);
  const names = Object.keys(schema.properties ?? {}).map((name) =>
    required.has(name) ? `${name}*` : name,
  );
  return names.length === 0 ? '(none)' : names.join(', ');
}

/** A fixture: one line per binary's tool, so a change reads as that line. */
export function renderSurface(
  fixture: Record<string, Record<string, unknown>>,
): string {
  const binaries = Object.entries(fixture).map(([bin, tools]) => {
    const lines = Object.entries(tools).map(
      ([name, value]) =>
        `    ${JSON.stringify(name)}: ${JSON.stringify(value)}`,
    );
    return `  ${JSON.stringify(bin)}: {\n${lines.join(',\n')}\n  }`;
  });
  return `{\n${binaries.join(',\n')}\n}\n`;
}

/** The HTTP fixture: each HTTP binary's tools and their inputs. */
export function httpFixture(
  http: Surface,
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(http).map(([bin, tools]) => [
      bin,
      Object.fromEntries(
        Object.entries(tools).map(([name, schema]) => [name, inputsOf(schema)]),
      ),
    ]),
  );
}

/**
 * The stdio/SSE fixture: each stdio binary's schemas in full, and each SSE
 * binary's tool names (its schemas are checked equal to stdio's).
 */
export function stdioSseFixture(
  stdio: Surface,
  sse: Surface,
): Record<string, Record<string, unknown>> {
  return {
    ...stdio,
    ...Object.fromEntries(
      Object.entries(sse).map(([bin, tools]) => [
        bin,
        Object.fromEntries(Object.keys(tools).map((name) => [name, true])),
      ]),
    ),
  };
}

/** Every binary's surface on each transport, as the transport test reads them. */
export async function transportSurfaces(
  standIn: AdtStandIn,
): Promise<{ http: Surface; stdio: Surface; sse: Surface }> {
  const http: Surface = {};
  const stdio: Surface = {};
  const sse: Surface = {};
  for (const kind of KINDS) {
    http[binOf('http', kind)] = await httpSurface(kind, standIn);
    stdio[binOf('stdio', kind)] = await stdioSurface(kind);
    sse[binOf('sse', kind)] = await sseSurface(kind, standIn);
  }
  return { http, stdio, sse };
}
