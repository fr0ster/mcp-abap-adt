/**
 * The input schemas each binary's server actually registers, read from the
 * server as a client reads them (`tools/list`): Streamable HTTP over real
 * HTTP, SSE over a real SSE stream, stdio over an in-memory transport.
 *
 * - On the four Streamable HTTP binaries every tool declares an optional
 *   string `state_handle` with the one description; a tool that declares its
 *   own (the debugger's) keeps it, required where it is required.
 * - stdio and SSE register the schemas they always registered: their
 *   fixture is the one recorded before the HTTP declaration existed, and an
 *   HTTP schema is that schema plus the declaration and nothing else.
 *
 * `WRITE_TRANSPORT_SURFACE=1 npm test -- src/__tests__/unit/toolSet/transportSurface.test.ts`
 * writes both fixtures first (refused under CI).
 */

import * as fs from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { compactToolSet as compactStdioSet } from '../../../../compact/src/launcher';
import { compactToolSet as compactHttpSet } from '../../../../compact-http/src/launcher';
import { readOnlyToolSet as compactHttpRoSet } from '../../../../compact-http-ro/src/launcher';
import { readOnlyToolSet as compactRoSet } from '../../../../compact-ro/src/launcher';
import { compactToolSet as compactSseSet } from '../../../../compact-sse/src/launcher';
import { readOnlyToolSet as compactSseRoSet } from '../../../../compact-sse-ro/src/launcher';
import { readOnlyToolSet as coreRoSet } from '../../../../core-ro/src/launcher';
import { readOnlyToolSet as httpRoSet } from '../../../../http-ro/src/launcher';
import { StreamableHttpServer } from '../../../../server-runtime/src/http/StreamableHttpServer';
import { SseServer } from '../../../../server-runtime/src/sse/SseServer';
import { StdioServer } from '../../../../server-runtime/src/stdio/StdioServer';
import { readOnlyToolSet as sseRoSet } from '../../../../sse-ro/src/launcher';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import {
  BINARIES,
  fullToolSet,
  registryOf,
  type ServedTransport,
  type ToolSet,
  type ToolSetKind,
} from '../../../lib/toolSet';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';

jest.setTimeout(120_000);

/** The words of the declared `state_handle` (spec §1). */
const STATE_HANDLE_WORDS =
  'The state_handle a long session, a lock or a batch answered: the call runs on the server instance that holds that state. Without it the call runs on a new instance.';

type Schema = {
  type?: string;
  properties?: Record<string, { type?: string; description?: string }>;
  required?: string[];
  [key: string]: unknown;
};
type Surface = Record<string, Record<string, Schema>>;

const FIXTURES = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'tools',
);
const HTTP_FIXTURE = path.join(FIXTURES, 'http-surface.json');
const STDIO_SSE_FIXTURE = path.join(FIXTURES, 'stdio-sse-surface.json');

const KINDS: readonly ToolSetKind[] = [
  'core',
  'core-ro',
  'compact',
  'compact-ro',
];

/** The long-session tools each kind of HTTP binary serves (spec §2). */
const SESSION_TOOLS: Record<ToolSetKind, readonly string[]> = {
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
  const server = new StdioServer(
    registryOf(toolSets.stdio[kind], 'stdio'),
    undefined,
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.start(undefined, serverSide);
  return listOver(new Client({ name: 'surface', version: '1' }), clientSide);
}

async function sseSurface(
  kind: ToolSetKind,
  standIn: AdtStandIn,
): Promise<Record<string, Schema>> {
  const sse = new SseServer(registryOf(toolSets.sse[kind], 'sse'), {
    host: '127.0.0.1',
    port: 0,
  });
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
    registryOf(toolSets.http[kind], 'http'),
    {
      host: '127.0.0.1',
      port: 0,
      // As the launcher: batch mode on, so descriptions carry its sentence.
      batch: { keepRawParts: false },
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
    expect(response.status).toBe(200);
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

const binOf = (transport: ServedTransport, kind: ToolSetKind) =>
  BINARIES[transport][kind].bin;

/** `name*` for a required parameter, `name` for an optional one. */
function inputsOf(schema: Schema): string {
  const required = new Set(schema.required ?? []);
  const names = Object.keys(schema.properties ?? {}).map((name) =>
    required.has(name) ? `${name}*` : name,
  );
  return names.length === 0 ? '(none)' : names.join(', ');
}

/** A fixture: one line per binary's tool, so a change reads as that line. */
function render(fixture: Record<string, Record<string, unknown>>): string {
  const binaries = Object.entries(fixture).map(([bin, tools]) => {
    const lines = Object.entries(tools).map(
      ([name, value]) =>
        `    ${JSON.stringify(name)}: ${JSON.stringify(value)}`,
    );
    return `  ${JSON.stringify(bin)}: {\n${lines.join(',\n')}\n  }`;
  });
  return `{\n${binaries.join(',\n')}\n}\n`;
}

describe('the schemas each binary registers (WRITE_TRANSPORT_SURFACE=1 rewrites the fixtures)', () => {
  let standIn: AdtStandIn;
  const http: Surface = {};
  const stdio: Surface = {};
  const sse: Surface = {};
  let savedSystemType: string | undefined;

  /** The HTTP fixture: each HTTP binary's tools and their inputs. */
  const httpFixture = () =>
    Object.fromEntries(
      Object.entries(http).map(([bin, tools]) => [
        bin,
        Object.fromEntries(
          Object.entries(tools).map(([name, schema]) => [
            name,
            inputsOf(schema),
          ]),
        ),
      ]),
    );

  /**
   * The stdio/SSE fixture: each stdio binary's schemas in full, and each SSE
   * binary's tool names (its schemas are checked equal to stdio's below).
   */
  const stdioSseFixture = () => ({
    ...stdio,
    ...Object.fromEntries(
      Object.entries(sse).map(([bin, tools]) => [
        bin,
        Object.fromEntries(Object.keys(tools).map((name) => [name, true])),
      ]),
    ),
  });

  beforeAll(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    resetProcessLatchForTests();
    // No system kind stated: nothing filtered, every tool of the set listed.
    savedSystemType = process.env.SAP_SYSTEM_TYPE;
    delete process.env.SAP_SYSTEM_TYPE;
    standIn = await adtStandIn();
    for (const kind of KINDS) {
      http[binOf('http', kind)] = await httpSurface(kind, standIn);
      stdio[binOf('stdio', kind)] = await stdioSurface(kind);
      sse[binOf('sse', kind)] = await sseSurface(kind, standIn);
    }
    if (process.env.WRITE_TRANSPORT_SURFACE === '1') {
      if (process.env.CI)
        throw new Error('the fixtures are not written under CI');
      fs.writeFileSync(HTTP_FIXTURE, render(httpFixture()));
      fs.writeFileSync(STDIO_SSE_FIXTURE, render(stdioSseFixture()));
    }
  });

  afterAll(async () => {
    await standIn?.close();
    if (savedSystemType !== undefined)
      process.env.SAP_SYSTEM_TYPE = savedSystemType;
    jest.restoreAllMocks();
  });

  const read = (file: string): unknown =>
    JSON.parse(fs.readFileSync(file, 'utf8'));

  it('lists every tool of every binary, so the assertions below are not vacuous', () => {
    const counts = (surface: Surface) =>
      Object.values(surface).map((tools) => Object.keys(tools).length);
    for (const surface of [http, stdio, sse]) {
      expect(Object.keys(surface)).toHaveLength(4);
      for (const count of counts(surface)) expect(count).toBeGreaterThan(15);
    }
  });

  it('stdio registers exactly the schemas of the fixture, and SSE the same schemas', () => {
    expect(stdioSseFixture()).toEqual(read(STDIO_SSE_FIXTURE));
    for (const kind of KINDS) {
      const stdioTools = stdio[binOf('stdio', kind)] ?? {};
      for (const [name, schema] of Object.entries(
        sse[binOf('sse', kind)] ?? {},
      )) {
        expect({ name, schema }).toEqual({ name, schema: stdioTools[name] });
      }
    }
  });

  it('the HTTP binaries register exactly the tools and inputs of their fixture', () => {
    expect(httpFixture()).toEqual(read(HTTP_FIXTURE));
  });

  it('every HTTP binary serves the tools of its SSE binary and its long-session tools, which no stdio or SSE binary serves', () => {
    for (const kind of KINDS) {
      const httpTools = http[binOf('http', kind)] ?? {};
      const sseTools = sse[binOf('sse', kind)] ?? {};
      const stdioTools = stdio[binOf('stdio', kind)] ?? {};
      expect({ kind, tools: Object.keys(httpTools).sort() }).toEqual({
        kind,
        tools: [...Object.keys(sseTools), ...SESSION_TOOLS[kind]].sort(),
      });
      for (const tool of Object.values(SESSION_TOOLS).flat()) {
        expect(sseTools[tool]).toBeUndefined();
        expect(stdioTools[tool]).toBeUndefined();
      }
    }
  });

  it('on every HTTP binary every tool declares state_handle — the SSE schema plus that and nothing else; the debugger keeps its own', () => {
    for (const kind of KINDS) {
      const httpTools = http[binOf('http', kind)] ?? {};
      const sseTools = sse[binOf('sse', kind)] ?? {};
      for (const [name, schema] of Object.entries(httpTools)) {
        if (SESSION_TOOLS[kind].includes(name)) {
          // HTTP's own: declared like every other tool, optional.
          expect({
            name,
            state_handle: schema.properties?.state_handle,
            required: (schema.required ?? []).includes('state_handle'),
          }).toEqual({
            name,
            state_handle: { type: 'string', description: STATE_HANDLE_WORDS },
            required: false,
          });
          continue;
        }
        const before = sseTools[name] as Schema;
        if (before.properties?.state_handle !== undefined) {
          // Declared by the tool itself: kept as it is, requiredness included.
          expect({ name, schema }).toEqual({ name, schema: before });
          continue;
        }
        expect({ name, state_handle: schema.properties?.state_handle }).toEqual(
          {
            name,
            state_handle: { type: 'string', description: STATE_HANDLE_WORDS },
          },
        );
        // The declaration and nothing else: optional, every other key as SSE's.
        const { state_handle: _added, ...rest } = schema.properties ?? {};
        expect({ name, schema: { ...schema, properties: rest } }).toEqual({
          name,
          schema: { ...before, properties: before.properties ?? {} },
        });
      }
    }
  });

  it('the debugger tools declare their own state_handle, required where required', () => {
    const own = Object.entries(sse[binOf('sse', 'core')] ?? {}).filter(
      ([, schema]) => schema.properties?.state_handle !== undefined,
    );
    expect(own.length).toBeGreaterThan(0);
    expect(
      own.some(([, schema]) => schema.required?.includes('state_handle')),
    ).toBe(true);
  });
});
