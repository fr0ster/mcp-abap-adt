/**
 * `SearchSource`'s strategies on the routes that need a served call:
 * `registerOnServer` through an actual long call (its own connection, from a
 * connection the factory built), `createRegistry()` hosted by an
 * `EmbeddableMcpServer` (the server's options, never the exporter's), and
 * batch mode. The handler is replaced by one recording the context it is
 * called in; the long calls run on the ADT stand-in.
 */
import { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import type {
  LineMatchStrategy,
  SapAnswerStrategy,
} from '../../../embeddable/index';
import { InstanceBatch } from '../../../lib/batch/InstanceBatch';
import { LateBoundConnection } from '../../../lib/batch/lateBound';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import { stateSystemKind } from '../../helpers/systemKind';

process.env.SAP_SYSTEM_TYPE = 'onprem';

const seen: HandlerContext[] = [];
jest.mock('../../../handlers/system/readonly/handleSearchSource', () => {
  const actual = jest.requireActual(
    '../../../handlers/system/readonly/handleSearchSource',
  );
  return {
    ...actual,
    handleSearchSource: async (context: HandlerContext) => {
      seen.push(context);
      return { isError: false, content: [{ type: 'text', text: 'recorded' }] };
    },
  };
});

const silent = { info() {}, debug() {}, warn() {}, error() {} };
const ARGS = { query: 'x', packages: ['Z'], background: false };
const exporterSap: SapAnswerStrategy = { decide: () => 'throw' };
const exporterLines: LineMatchStrategy = {
  match: () => ({ hits: [], capped: false }),
};
const serverSap: SapAnswerStrategy = { decide: () => 'end' };
const serverLines: LineMatchStrategy = {
  match: () => ({ hits: [], capped: true }),
};

let standIn: AdtStandIn;
let built: IAbapConnection;
beforeEach(async () => {
  seen.length = 0;
  standIn = await adtStandIn();
  stateSystemKind();
  // A connection the factory built: a long call opens its own from it.
  built = createAbapConnection(
    { url: standIn.url, client: '100', authType: 'basic' },
    new BasicAuthProvider('ROUTE_USER', 'route-password'),
  );
  await built.connect();
});
afterEach(async () => {
  await standIn.close();
});

/** A client linked to `server` in memory. */
async function clientOf(server: McpServer | EmbeddableMcpServer) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'routes', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

describe('registerOnServer, through an actual long call', () => {
  it.each([
    ['with the options', true],
    ['without the options', false],
  ] as const)('%s', async (_name, given) => {
    const exporter = new HandlerExporter({
      systemType: 'onprem',
      ...(given
        ? { sapAnswerStrategy: exporterSap, lineMatchStrategy: exporterLines }
        : {}),
    });
    const server = new McpServer({ name: 'routes', version: '1.0.0' });
    exporter.registerOnServer(server, async () => built);
    const client = await clientOf(server);
    try {
      const answer = await client.callTool({
        name: 'SearchSource',
        arguments: ARGS,
      });
      expect(answer.isError).toBeFalsy();
      expect(seen).toHaveLength(1);
      const [context] = seen;
      // The long call's own connection, not the provider's.
      expect(context?.connection).not.toBe(built);
      if (given) {
        expect(context?.sapAnswerStrategy).toBe(exporterSap);
        expect(context?.lineMatchStrategy).toBe(exporterLines);
      } else {
        expect(context !== undefined && 'sapAnswerStrategy' in context).toBe(
          false,
        );
        expect(context !== undefined && 'lineMatchStrategy' in context).toBe(
          false,
        );
      }
    } finally {
      await client.close();
    }
  });
});

describe('createRegistry() hosted by an EmbeddableMcpServer', () => {
  it("the server's options apply, the exporter's never", async () => {
    const exporter = new HandlerExporter({
      systemType: 'onprem',
      sapAnswerStrategy: exporterSap,
      lineMatchStrategy: exporterLines,
    });
    const server = new EmbeddableMcpServer({
      connection: built,
      handlersRegistry: exporter.createRegistry(),
      systemType: 'onprem',
      logger: silent,
      sapAnswerStrategy: serverSap,
      lineMatchStrategy: serverLines,
    });
    const client = await clientOf(server);
    try {
      await client.callTool({ name: 'SearchSource', arguments: ARGS });
      expect(seen).toHaveLength(1);
      expect(seen[0]?.sapAnswerStrategy).toBe(serverSap);
      expect(seen[0]?.lineMatchStrategy).toBe(serverLines);
    } finally {
      await client.close();
    }
  });
});

describe('batch mode', () => {
  it('SearchSource in an open batch is refused batch_not_recordable before its handler: no recorded context carries a search (measured)', async () => {
    const owner = new InstanceBatch({ keepRawParts: false });
    const target = new LateBoundConnection();
    const batch = new AdtBatchConnection(target, { endpoint: 'communication' });
    owner.begin('communication', { connection: batch, target, recorded: [] });
    const exporter = new HandlerExporter({ systemType: 'onprem' });
    const server = new EmbeddableMcpServer({
      connection: built,
      handlersRegistry: exporter.createRegistry(),
      systemType: 'onprem',
      logger: silent,
      batch: owner,
      sapAnswerStrategy: serverSap,
      lineMatchStrategy: serverLines,
    });
    const client = await clientOf(server);
    try {
      const answer = await client.callTool({
        name: 'SearchSource',
        arguments: ARGS,
      });
      expect(answer.isError).toBe(true);
      const content = answer.content;
      const text =
        Array.isArray(content) && typeof content[0]?.text === 'string'
          ? content[0].text
          : '';
      expect(JSON.parse(text).error).toBe('batch_not_recordable');
      expect(seen).toEqual([]);
    } finally {
      await client.close();
    }
  });
});
