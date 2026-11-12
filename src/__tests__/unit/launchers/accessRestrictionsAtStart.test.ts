/**
 * Each launcher applies the access restrictions its start read (spec §2):
 * stdio, Streamable HTTP and SSE, each started in-process against the ADT
 * stand-in, leave a denied tool out of `tools/list`, write the start line
 * once through `deps.stderr` (a pooled HTTP server once, not per instance),
 * and check a call against the allowed packages; a malformed entry stops the
 * start in the form it was given.
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
import { readHttpConfig } from '../../../../server-runtime/src/http/config/httpParameters';
import { launch as launchHttp } from '../../../../server-runtime/src/http/launcher';
import { readSseConfig } from '../../../../server-runtime/src/sse/config/sseParameters';
import { launch as launchSse } from '../../../../server-runtime/src/sse/launcher';
import { readCoreConfig } from '../../../../server-runtime/src/stdio/config/coreParameters';
import { launch as launchStdio } from '../../../../server-runtime/src/stdio/launcher';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import { ParameterRefusal } from '../../../lib/config/authParameters';
import { fullToolSet } from '../../../lib/toolSet';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';

const USER = 'ACCESS_USER';
const PASSWORD = 'access-password';
const LINE = '[MCP] Access restrictions:';

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
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'access-')));
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

const startLines = (lines: readonly string[]) =>
  lines.filter((line) => line.startsWith(LINE));

/** The first content text of a tool answer, parsed. */
function errorOf(result: object): unknown {
  const content =
    'content' in result && Array.isArray(result.content) ? result.content : [];
  const first: unknown = content[0];
  if (
    typeof first !== 'object' ||
    first === null ||
    !('text' in first) ||
    typeof first.text !== 'string'
  ) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(first.text);
  return typeof parsed === 'object' && parsed !== null && 'error' in parsed
    ? parsed.error
    : undefined;
}

describe('the stdio launcher', () => {
  it('leaves a denied tool out, names an unmatched entry, writes the line once', async () => {
    const config = readCoreConfig(
      [
        `--env-path=${envFile}`,
        `--auth-broker-path=${root}`,
        '--system-type=onprem',
        '--deny-actions=DeleteClass,DebugStepX',
        '--allowed-packages=Z*',
      ],
      process.env,
      null,
    );
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const exits: number[] = [];
    const stderr = mock.fn((_line: string) => {});
    const edges = processLike();
    mock.method(process.stderr, 'write', () => true);
    await launchStdio(
      config,
      {
        toolSet: fullToolSet,
        program: 'mcp-abap-adt',
        version: '0.0.0-test',
        packageName: '@mcp-abap-adt/core',
      },
      {
        browserStrategy: () => {
          throw new Error('no login in this test');
        },
        stderr,
        exit: (code) => exits.push(code),
        processLike: edges,
        platform: 'linux',
        transport: serverSide,
      },
    );
    const lines = stderr.mock.calls.map((call) => String(call.arguments[0]));
    assert.deepEqual(exits, [], lines.join('\n'));
    const client = new Client({ name: 'access', version: '1' });
    await client.connect(clientSide);
    try {
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      assert.equal(names.includes('DeleteClass'), false);
      assert.ok(names.includes('DeleteProgram'));
      assert.equal(
        errorOf(
          await client.callTool({
            name: 'CreateClass',
            arguments: { class_name: 'ZC', package_name: 'YFOO' },
          }),
        ),
        'package_not_allowed',
      );
    } finally {
      await client.close().catch(() => undefined);
      edges.stdin.emit('end');
    }
    assert.deepEqual(startLines(lines), [
      `${LINE} deny-actions 2 (matching nothing here: DebugStepX), allowed-packages 1`,
    ]);
  });
});

/** The answer of one JSON-RPC request to the HTTP server. */
async function httpAsk(port: number, body: object): Promise<unknown> {
  const response = await fetch(`http://127.0.0.1:${port}/mcp/stream/http`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...sapHeaders(),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...body }),
  });
  const raw = await response.text();
  assert.equal(response.status, 200, raw);
  const json = raw.startsWith('{')
    ? raw
    : (raw
        .split('\n')
        .find((line) => line.startsWith('data: '))
        ?.slice('data: '.length) ?? '');
  const parsed: unknown = JSON.parse(json);
  assert.ok(
    typeof parsed === 'object' && parsed !== null && 'result' in parsed,
  );
  return parsed.result;
}

describe('the Streamable HTTP launcher', () => {
  it('applies the restrictions to every instance and writes the line once', async () => {
    const port = await freePort();
    const config = readHttpConfig(
      [
        '--system-type=onprem',
        '--host=127.0.0.1',
        `--port=${port}`,
        '--deny-actions=DeleteClass',
        '--allowed-packages=Z*',
      ],
      process.env,
      null,
    );
    const stderr = mock.fn((_line: string) => {});
    const exits: number[] = [];
    const server = await launchHttp(
      config,
      {
        toolSet: fullToolSet,
        program: 'mcp-abap-adt-http',
        version: '0.0.0-test',
        packageName: '@mcp-abap-adt/http',
      },
      { stderr, exit: (code) => exits.push(code), processLike: processLike() },
    );
    assert.ok(server !== undefined, `the HTTP launcher exited: ${exits}`);
    try {
      const listed = await httpAsk(port, { method: 'tools/list' });
      assert.ok(
        typeof listed === 'object' && listed !== null && 'tools' in listed,
      );
      const tools: unknown = listed.tools;
      assert.ok(Array.isArray(tools));
      const names = tools.map((tool: unknown) =>
        typeof tool === 'object' && tool !== null && 'name' in tool
          ? String(tool.name)
          : '',
      );
      assert.equal(names.includes('DeleteClass'), false);
      const answer = await httpAsk(port, {
        method: 'tools/call',
        params: {
          name: 'CreateClass',
          arguments: { class_name: 'ZC', package_name: 'YFOO' },
        },
      });
      assert.ok(typeof answer === 'object' && answer !== null);
      assert.equal(errorOf(answer), 'package_not_allowed');
    } finally {
      await server.stop();
    }
    const lines = stderr.mock.calls.map((call) => String(call.arguments[0]));
    assert.deepEqual(startLines(lines), [
      `${LINE} deny-actions 1, allowed-packages 1`,
    ]);
  });

  it('a malformed entry stops the start, named in its form', () => {
    assert.throws(
      () =>
        readHttpConfig(
          ['--system-type=onprem', '--deny-actions=Del*ete'],
          process.env,
          null,
        ),
      (error: unknown) =>
        error instanceof ParameterRefusal &&
        error.words.startsWith('Invalid --deny-actions entry "Del*ete"'),
    );
  });
});

describe('the SSE launcher', () => {
  it('leaves a denied tool out and writes the line once', async () => {
    const port = await freePort();
    const config = readSseConfig(
      [
        '--system-type=onprem',
        '--sse-host=127.0.0.1',
        `--sse-port=${port}`,
        '--deny-actions=DeleteClass',
      ],
      process.env,
      null,
    );
    const stderr = mock.fn((_line: string) => {});
    const exits: number[] = [];
    const server = await launchSse(
      config,
      {
        toolSet: fullToolSet,
        program: 'mcp-abap-adt-sse',
        version: '0.0.0-test',
        packageName: '@mcp-abap-adt/sse',
      },
      { stderr, exit: (code) => exits.push(code), processLike: processLike() },
    );
    assert.ok(server !== undefined, `the SSE launcher exited: ${exits}`);
    const headers = sapHeaders();
    const client = new Client({ name: 'access', version: '1' });
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
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      assert.equal(names.includes('DeleteClass'), false);
    } finally {
      await client.close().catch(() => undefined);
      await server.stop();
    }
    const lines = stderr.mock.calls.map((call) => String(call.arguments[0]));
    assert.deepEqual(startLines(lines), [`${LINE} deny-actions 1`]);
  });

  it('writes none-line with nothing configured', async () => {
    const port = await freePort();
    const config = readSseConfig(
      ['--system-type=onprem', '--sse-host=127.0.0.1', `--sse-port=${port}`],
      process.env,
      null,
    );
    const stderr = mock.fn((_line: string) => {});
    const server = await launchSse(
      config,
      {
        toolSet: fullToolSet,
        program: 'mcp-abap-adt-sse',
        version: '0.0.0-test',
        packageName: '@mcp-abap-adt/sse',
      },
      { stderr, exit: () => {}, processLike: processLike() },
    );
    assert.ok(server !== undefined);
    await server.stop();
    const lines = stderr.mock.calls.map((call) => String(call.arguments[0]));
    assert.deepEqual(startLines(lines), [`${LINE} none`]);
  });
});
