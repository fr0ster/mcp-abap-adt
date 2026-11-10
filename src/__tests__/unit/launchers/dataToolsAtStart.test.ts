/**
 * Each launcher serves the data tools only when its configuration turns them
 * on (`--enable-data-tools`, spec §3): stdio, Streamable HTTP and SSE, each
 * started in-process against the ADT stand-in, list them with the flag and
 * none of them without it. stdio is checked for the compact set too.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import { createServer } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it,
  mock,
} from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { compactToolSet } from '../../../../compact/src/launcher';
import { readHttpConfig } from '../../../../server-runtime/src/http/config/httpParameters';
import { launch as launchHttp } from '../../../../server-runtime/src/http/launcher';
import { readSseConfig } from '../../../../server-runtime/src/sse/config/sseParameters';
import { launch as launchSse } from '../../../../server-runtime/src/sse/launcher';
import { readCoreConfig } from '../../../../server-runtime/src/stdio/config/coreParameters';
import { launch as launchStdio } from '../../../../server-runtime/src/stdio/launcher';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import { fullToolSet, type ToolSet } from '../../../lib/toolSet';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';

const FULL_DATA = ['GetSqlQuery', 'GetTableContents'];
const COMPACT_DATA = ['HandlerGetData'];
const FLAG = '--enable-data-tools';
const USER = 'DATA_USER';
const PASSWORD = 'data-password';

let standIn: AdtStandIn;
let root: string;
let envFile: string;
const savedEnv = { ...process.env };

before(async () => {
  standIn = await adtStandIn();
});

after(async () => {
  await standIn.close();
});

beforeEach(() => {
  resetProcessLatchForTests();
  for (const name of Object.keys(process.env)) {
    if (name.startsWith('SAP_') || name.startsWith('MCP_')) {
      delete process.env[name];
    }
  }
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'data-tools-')));
  envFile = path.join(root, 'stand.env');
  fs.writeFileSync(
    envFile,
    [
      `SAP_URL=${standIn.url}`,
      'SAP_CLIENT=100',
      'SAP_AUTH_TYPE=basic',
      'SAP_CONNECTION_TYPE=http',
      `SAP_USERNAME=${USER}`,
      `SAP_PASSWORD=${PASSWORD}`,
      '',
    ].join('\n'),
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  process.env = { ...savedEnv };
  mock.restoreAll();
});

const processLike = () =>
  Object.assign(new EventEmitter(), { stdin: new EventEmitter() });

const dataIn = (names: readonly string[], data: readonly string[]) =>
  names.filter((name) => data.includes(name)).sort();

/** A port nothing listens on now. */
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  assert.ok(address !== null && typeof address === 'object');
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return address.port;
}

const sapHeaders = () => ({
  'x-sap-url': standIn.url,
  'x-sap-client': '100',
  'x-sap-login': USER,
  'x-sap-password': PASSWORD,
});

/** stdio: the launcher over an in-memory transport; the tool names it lists. */
async function stdioNames(toolSet: ToolSet, flag: boolean): Promise<string[]> {
  const config = readCoreConfig(
    [
      `--env-path=${envFile}`,
      `--auth-broker-path=${root}`,
      '--system-type=onprem',
      ...(flag ? [FLAG] : []),
    ],
    process.env,
    null,
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const exits: number[] = [];
  const lines: string[] = [];
  const edges = processLike();
  mock.method(process.stderr, 'write', () => true);
  await launchStdio(
    config,
    {
      toolSet,
      program: 'mcp-abap-adt',
      version: '0.0.0-test',
      packageName: '@mcp-abap-adt/core',
    },
    {
      browserStrategy: () => {
        throw new Error('no login in this test');
      },
      stderr: (line) => lines.push(line),
      exit: (code) => exits.push(code),
      processLike: edges,
      platform: 'linux',
      transport: serverSide,
    },
  );
  assert.deepEqual(exits, [], lines.join('\n'));
  const client = new Client({ name: 'data-tools', version: '1' });
  await client.connect(clientSide);
  try {
    return (await client.listTools()).tools.map((tool) => tool.name);
  } finally {
    await client.close().catch(() => undefined);
    edges.stdin.emit('end');
    const end = Date.now() + 10_000;
    while (exits.length === 0 && Date.now() < end) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}

/** Streamable HTTP: the launcher on a free port; the tool names `tools/list` answers. */
async function httpNames(flag: boolean): Promise<string[]> {
  const port = await freePort();
  const config = readHttpConfig(
    [
      '--system-type=onprem',
      '--host=127.0.0.1',
      `--port=${port}`,
      ...(flag ? [FLAG] : []),
    ],
    process.env,
    null,
  );
  const exits: number[] = [];
  const server = await launchHttp(
    config,
    {
      toolSet: fullToolSet,
      program: 'mcp-abap-adt-http',
      version: '0.0.0-test',
      packageName: '@mcp-abap-adt/http',
    },
    {
      stderr: () => {},
      exit: (code) => exits.push(code),
      processLike: processLike(),
    },
  );
  assert.ok(server !== undefined, `the HTTP launcher exited: ${exits}`);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/mcp/stream/http`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...sapHeaders(),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    const raw = await response.text();
    assert.equal(response.status, 200, raw);
    const json = raw.startsWith('{')
      ? raw
      : (raw
          .split('\n')
          .find((line) => line.startsWith('data: '))
          ?.slice('data: '.length) ?? '');
    const body: unknown = JSON.parse(json);
    assert.ok(typeof body === 'object' && body !== null && 'result' in body);
    const result: unknown = body.result;
    assert.ok(
      typeof result === 'object' && result !== null && 'tools' in result,
    );
    const tools: unknown = result.tools;
    assert.ok(Array.isArray(tools));
    return tools.map((tool: unknown) => {
      assert.ok(typeof tool === 'object' && tool !== null && 'name' in tool);
      return String(tool.name);
    });
  } finally {
    await server.stop();
  }
}

/** SSE: the launcher on a free port; the tool names its stream lists. */
async function sseNames(flag: boolean): Promise<string[]> {
  const port = await freePort();
  const config = readSseConfig(
    [
      '--system-type=onprem',
      '--sse-host=127.0.0.1',
      `--sse-port=${port}`,
      ...(flag ? [FLAG] : []),
    ],
    process.env,
    null,
  );
  const exits: number[] = [];
  const server = await launchSse(
    config,
    {
      toolSet: fullToolSet,
      program: 'mcp-abap-adt-sse',
      version: '0.0.0-test',
      packageName: '@mcp-abap-adt/sse',
    },
    {
      stderr: () => {},
      exit: (code) => exits.push(code),
      processLike: processLike(),
    },
  );
  assert.ok(server !== undefined, `the SSE launcher exited: ${exits}`);
  const headers = sapHeaders();
  const client = new Client({ name: 'data-tools', version: '1' });
  try {
    await client.connect(
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
    return (await client.listTools()).tools.map((tool) => tool.name);
  } finally {
    await client.close().catch(() => undefined);
    await server.stop();
  }
}

describe('the stdio launcher', () => {
  it('serves the data tools with --enable-data-tools', async () => {
    assert.deepEqual(
      dataIn(await stdioNames(fullToolSet, true), FULL_DATA),
      FULL_DATA,
    );
  });

  it('serves none of them without it', async () => {
    assert.deepEqual(
      dataIn(await stdioNames(fullToolSet, false), FULL_DATA),
      [],
    );
  });

  // One start per case: a stdio shutdown latches the process until the
  // next case resets it.
  it('serves the compact data tool with --enable-data-tools', async () => {
    assert.deepEqual(
      dataIn(await stdioNames(compactToolSet, true), COMPACT_DATA),
      COMPACT_DATA,
    );
  });

  it('serves no compact data tool without it', async () => {
    assert.deepEqual(
      dataIn(await stdioNames(compactToolSet, false), COMPACT_DATA),
      [],
    );
  });
});

describe('the Streamable HTTP launcher', () => {
  it('serves the data tools with --enable-data-tools', async () => {
    assert.deepEqual(dataIn(await httpNames(true), FULL_DATA), FULL_DATA);
  });

  it('serves none of them without it', async () => {
    assert.deepEqual(dataIn(await httpNames(false), FULL_DATA), []);
  });
});

describe('the SSE launcher', () => {
  it('serves the data tools with --enable-data-tools', async () => {
    assert.deepEqual(dataIn(await sseNames(true), FULL_DATA), FULL_DATA);
  });

  it('serves none of them without it', async () => {
    assert.deepEqual(dataIn(await sseNames(false), FULL_DATA), []);
  });
});
