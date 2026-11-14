/**
 * The SSE launcher builds its server with `SearchSource`'s shipped
 * strategies (DO22, DO24): the session instance's context carries
 * `skipSapAnswers` and `substringLineMatch`. The server is built and started
 * by the launcher (`main`); a client opens a stream with `x-sap-*`
 * credentials of the ADT stand-in; the handler records its context.
 */
import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import {
  skipSapAnswers,
  substringLineMatch,
} from '@mcp-abap-adt/lib/embeddable';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import {
  type AdtStandIn,
  adtStandIn,
} from '../../../../src/__tests__/helpers/adtStandIn';
import { main } from '../launcher';

const seen: HandlerContext[] = [];
jest.mock('../../../../src/handlers/system/readonly/handleSearchSource', () => {
  const actual = jest.requireActual(
    '../../../../src/handlers/system/readonly/handleSearchSource',
  );
  return {
    ...actual,
    handleSearchSource: async (context: HandlerContext) => {
      seen.push(context);
      return { isError: false, content: [{ type: 'text', text: 'recorded' }] };
    },
  };
});

const savedEnv = { ...process.env };
let standIn: AdtStandIn;
beforeEach(async () => {
  standIn = await adtStandIn();
});
afterEach(async () => {
  await standIn.close();
  process.env = { ...savedEnv };
});

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  const port =
    typeof address === 'object' && address !== null ? address.port : 0;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

/** The data of the next `event: <name>` in an SSE stream, read by plain string search. */
function eventReader(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return async (name: string): Promise<string> => {
    const marker = `event: ${name}\n`;
    for (;;) {
      const at = buffer.indexOf(marker);
      if (at >= 0) {
        const dataAt = buffer.indexOf('data: ', at + marker.length);
        const end = dataAt >= 0 ? buffer.indexOf('\n', dataAt) : -1;
        if (end >= 0) {
          const data = buffer.slice(dataAt + 'data: '.length, end).trim();
          buffer = buffer.slice(end + 1);
          return data;
        }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('stream ended');
      buffer += decoder.decode(value, { stream: true }).split('\r').join('');
    }
  };
}

it('the SSE launcher passes the shipped strategies to its session server', async () => {
  const port = await freePort();
  const server = await main(
    {
      toolSet: fullToolSet,
      program: 'mcp-abap-adt-sse',
      version: '0.0.0',
      packageName: '@mcp-abap-adt/sse',
    },
    {
      argv: [
        '--sse-host=127.0.0.1',
        `--sse-port=${port}`,
        '--system-type=onprem',
      ],
      stdout: () => {},
      stderr: () => {},
      exit: () => {},
      processLike: Object.assign(new EventEmitter(), {
        stdin: new EventEmitter(),
      }),
    },
  );
  if (server === undefined) throw new Error('the launcher started no server');
  const baseUrl = `http://127.0.0.1:${port}`;
  const controller = new AbortController();
  try {
    const res = await fetch(`${baseUrl}/sse`, {
      headers: {
        'x-sap-url': standIn.url,
        'x-sap-client': '100',
        'x-sap-login': 'STRATEGY_USER',
        'x-sap-password': 'strategy-password',
      },
      signal: controller.signal,
    });
    expect(res.status).toBe(200);
    if (res.body === null) throw new Error('no stream');
    const next = eventReader(res.body);
    const endpoint = new URL(await next('endpoint'), baseUrl);
    const accepted = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'SearchSource',
          arguments: { query: 'x', packages: ['Z'], background: false },
        },
      }),
    });
    expect(accepted.status).toBe(202);
    await next('message');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.sapAnswerStrategy).toBe(skipSapAnswers);
    expect(seen[0]?.lineMatchStrategy).toBe(substringLineMatch);
  } finally {
    controller.abort();
    await server.stop();
  }
});
