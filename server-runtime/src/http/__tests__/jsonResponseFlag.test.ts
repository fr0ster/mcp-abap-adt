/**
 * `--http-json-response=false` is honoured (D26 C4): in each of its forms a
 * stated `false` gives SSE streams, a stated `true` JSON responses, and an
 * absent flag the server's default, JSON. Observed on the wire: the answer
 * to an `initialize` POST is `text/event-stream` or `application/json`.
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { main } from '../launcher';
import type { StreamableHttpServer } from '../StreamableHttpServer';

jest.setTimeout(30_000);

const savedEnv = process.env;
let running: StreamableHttpServer | undefined;
let dir: string | undefined;

afterEach(async () => {
  process.env = savedEnv;
  await running?.stop().catch(() => undefined);
  running = undefined;
  if (dir !== undefined) fs.rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

/** The content type of the answer to `initialize` on a server started with `argv` and `env`. */
async function answerType(
  argv: string[],
  env: NodeJS.ProcessEnv = {},
  yaml?: string,
): Promise<string | null> {
  const clean: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(savedEnv)) {
    if (!key.startsWith('SAP_') && !key.startsWith('MCP_')) clean[key] = value;
  }
  process.env = { ...clean, ...env };
  const args = [
    '--system-type=onprem',
    '--host=127.0.0.1',
    '--port=0',
    ...argv,
  ];
  if (yaml !== undefined) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-response-'));
    const file = path.join(dir, 'conf.yaml');
    fs.writeFileSync(file, yaml, 'utf8');
    args.push(`--conf=${file}`);
  }
  const lines: string[] = [];
  running = await main(
    {
      toolSet: fullToolSet,
      program: 'mcp-abap-adt-http',
      version: '0.0.0',
      packageName: '@mcp-abap-adt/http',
    },
    {
      argv: args,
      stdout: () => {},
      stderr: (line) => lines.push(line),
      exit: (code) => lines.push(`exit ${code}`),
      processLike: Object.assign(new EventEmitter(), {
        stdin: new EventEmitter(),
      }),
    },
  );
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const port = running?.listeningPort();
    if (port === undefined) throw new Error(JSON.stringify(lines));
    const answer = await fetch(`http://127.0.0.1:${port}/mcp/stream/http`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'x-sap-url': 'https://sap.invalid',
        'x-sap-jwt-token': 'header.payload.signature',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'json-response-test', version: '1.0.0' },
        },
      }),
    });
    await answer.text();
    return answer.headers.get('content-type');
  } finally {
    errors.mockRestore();
  }
}

it.each([
  ['--http-json-response=false', ['--http-json-response=false'], {}, undefined],
  [
    'MCP_HTTP_ENABLE_JSON_RESPONSE=false',
    [],
    { MCP_HTTP_ENABLE_JSON_RESPONSE: 'false' },
    undefined,
  ],
  ['YAML http.json-response: false', [], {}, 'http:\n  json-response: false\n'],
] as const)('%s gives SSE streams', async (_form, argv, env, yaml) => {
  expect(await answerType([...argv], { ...env }, yaml)).toContain(
    'text/event-stream',
  );
});

it('--http-json-response (true) gives JSON responses', async () => {
  expect(await answerType(['--http-json-response'])).toContain(
    'application/json',
  );
});

it('absent, the server answers JSON, as before', async () => {
  expect(await answerType([])).toContain('application/json');
});
