/**
 * The HTTP launcher builds its server with `SearchSource`'s shipped
 * strategies (DO22, DO24): the per-request instance's context carries
 * `skipSapAnswers` and `substringLineMatch`. The server is built and started
 * by the launcher (`main`); a client calls it with `x-sap-*` credentials of
 * the ADT stand-in; the handler is replaced by one recording its context.
 */
import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import {
  skipSapAnswers,
  substringLineMatch,
} from '@mcp-abap-adt/lib/embeddable';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  type AdtStandIn,
  adtStandIn,
} from '../../../../src/__tests__/helpers/adtStandIn';
import { clientTransport } from '../../../../src/__tests__/helpers/clientTransport';
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

/** A port nothing listens on now. */
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  const port =
    typeof address === 'object' && address !== null ? address.port : 0;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

it('the HTTP launcher passes the shipped strategies to its per-request server', async () => {
  const port = await freePort();
  const server = await main(
    {
      toolSet: fullToolSet,
      program: 'mcp-abap-adt-http',
      version: '0.0.0',
      packageName: '@mcp-abap-adt/http',
    },
    {
      argv: ['--host=127.0.0.1', `--port=${port}`, '--system-type=onprem'],
      stdout: () => {},
      stderr: () => {},
      exit: () => {},
      processLike: Object.assign(new EventEmitter(), {
        stdin: new EventEmitter(),
      }),
    },
  );
  if (server === undefined) throw new Error('the launcher started no server');
  const client = new Client({ name: 'http-strategies', version: '1.0.0' });
  try {
    await client.connect(
      clientTransport(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${port}/mcp/stream/http`),
          {
            requestInit: {
              headers: {
                'x-sap-url': standIn.url,
                'x-sap-client': '100',
                'x-sap-login': 'STRATEGY_USER',
                'x-sap-password': 'strategy-password',
              },
            },
          },
        ),
      ),
    );
    await client.callTool({
      name: 'SearchSource',
      arguments: { query: 'x', packages: ['Z'], background: false },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.sapAnswerStrategy).toBe(skipSapAnswers);
    expect(seen[0]?.lineMatchStrategy).toBe(substringLineMatch);
  } finally {
    await client.close();
    await server.stop();
  }
});
