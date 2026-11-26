/**
 * `SearchSource`'s strategies on the routes that need a served call:
 * `registerOnServer` through an actual long call (its own connection, from a
 * connection the factory built), `createRegistry()` hosted by an
 * `EmbeddableMcpServer` (the server's options, never the exporter's), and
 * batch mode. The handler is replaced by one recording the context it is
 * called in; the long calls run on the ADT stand-in.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
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
import * as searchSourceHandler from '../../../handlers/system/readonly/handleSearchSource';
import { InstanceBatch } from '../../../lib/batch/InstanceBatch';
import { LateBoundConnection } from '../../../lib/batch/lateBound';
import { createAbapConnection } from '../../../lib/connectionFactory';
import { HandlerExporter } from '../../../lib/handlers/HandlerExporter';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import { stateSystemKind } from '../../helpers/systemKind';

process.env.SAP_SYSTEM_TYPE = 'onprem';

const seen: HandlerContext[] = [];
// handleSearchSource replaced on the module that defines it (the search
// group reads it at call time); its other names
// stay real.
mock.method(
  searchSourceHandler,
  'handleSearchSource',
  async (context: HandlerContext) => {
    seen.push(context);
    return { isError: false, content: [{ type: 'text', text: 'recorded' }] };
  },
);

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
  for (const [_name, given] of [
    ['with the options', true],
    ['without the options', false],
  ] as const) {
    it(format('%s', _name), async () => {
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
        assert.ok(!answer.isError);
        assert.equal(seen.length, 1);
        const [context] = seen;
        // The long call's own connection, not the provider's.
        assert.notEqual(context?.connection, built);
        if (given) {
          assert.equal(context?.sapAnswerStrategy, exporterSap);
          assert.equal(context?.lineMatchStrategy, exporterLines);
        } else {
          assert.equal(
            context !== undefined && 'sapAnswerStrategy' in context,
            false,
          );
          assert.equal(
            context !== undefined && 'lineMatchStrategy' in context,
            false,
          );
        }
      } finally {
        await client.close();
      }
    });
  }
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
      assert.equal(seen.length, 1);
      assert.equal(seen[0]?.sapAnswerStrategy, serverSap);
      assert.equal(seen[0]?.lineMatchStrategy, serverLines);
    } finally {
      await client.close();
    }
  });
});

describe("readsPerEnvelope, the consumer's envelope bound", () => {
  it("HandlerExporter.registerOnServer: the exporter's bound reaches the call; absent, none", async () => {
    for (const bound of [7, undefined]) {
      seen.length = 0;
      const exporter = new HandlerExporter({
        systemType: 'onprem',
        ...(bound !== undefined && { readsPerEnvelope: bound }),
      });
      const server = new McpServer({ name: 'routes', version: '1.0.0' });
      exporter.registerOnServer(server, async () => built);
      const client = await clientOf(server);
      try {
        await client.callTool({ name: 'SearchSource', arguments: ARGS });
        assert.equal(seen[0]?.readsPerEnvelope, bound);
      } finally {
        await client.close();
      }
    }
  });

  it('two EmbeddableMcpServer instances keep their own bounds', async () => {
    const serverOf = (readsPerEnvelope?: number) =>
      new EmbeddableMcpServer({
        connection: built,
        handlersRegistry: new HandlerExporter({
          systemType: 'onprem',
        }).createRegistry(),
        systemType: 'onprem',
        logger: silent,
        ...(readsPerEnvelope !== undefined && { readsPerEnvelope }),
      });
    const five = await clientOf(serverOf(5));
    const nine = await clientOf(serverOf(9));
    const none = await clientOf(serverOf());
    try {
      await five.callTool({ name: 'SearchSource', arguments: ARGS });
      await nine.callTool({ name: 'SearchSource', arguments: ARGS });
      await none.callTool({ name: 'SearchSource', arguments: ARGS });
      assert.deepStrictEqual(
        seen.map((context) => context.readsPerEnvelope),
        [5, 9, undefined],
      );
    } finally {
      await Promise.all([five.close(), nine.close(), none.close()]);
    }
  });

  it('an option below 2 or not whole is refused at construction', () => {
    for (const value of [1, 0, 2.5]) {
      assert.throws(
        () =>
          new EmbeddableMcpServer({
            connection: built,
            systemType: 'onprem',
            logger: silent,
            readsPerEnvelope: value,
          }),
        (error: unknown) =>
          error instanceof Error &&
          error.message ===
            'Invalid readsPerEnvelope: must be a whole number of reads from 2',
      );
      assert.throws(
        () =>
          new HandlerExporter({
            systemType: 'onprem',
            readsPerEnvelope: value,
          }),
        (error: unknown) =>
          error instanceof Error &&
          error.message ===
            'Invalid readsPerEnvelope: must be a whole number of reads from 2',
      );
    }
  });
});

describe('batch mode', () => {
  for (const [_name, strategies] of [
    ['the SAP-answer strategy given', { sapAnswerStrategy: serverSap }],
    ['the line match given', { lineMatchStrategy: serverLines }],
    [
      'both given',
      { sapAnswerStrategy: serverSap, lineMatchStrategy: serverLines },
    ],
  ] satisfies [
    string,
    {
      sapAnswerStrategy?: SapAnswerStrategy;
      lineMatchStrategy?: LineMatchStrategy;
    },
  ][]) {
    it(
      format(
        'SearchSource in an open batch is refused batch_not_recordable before its handler, %s (DO26: it is no batch entry)',
        _name,
      ),
      async () => {
        const owner = new InstanceBatch({ keepRawParts: false });
        const target = new LateBoundConnection();
        const batch = new AdtBatchConnection(target, {
          endpoint: 'communication',
        });
        owner.begin('communication', {
          connection: batch,
          target,
          recorded: [],
        });
        const exporter = new HandlerExporter({ systemType: 'onprem' });
        const server = new EmbeddableMcpServer({
          connection: built,
          handlersRegistry: exporter.createRegistry(),
          systemType: 'onprem',
          logger: silent,
          batch: owner,
          ...strategies,
        });
        const client = await clientOf(server);
        try {
          const answer = await client.callTool({
            name: 'SearchSource',
            arguments: ARGS,
          });
          assert.equal(answer.isError, true);
          const content = answer.content;
          const text =
            Array.isArray(content) && typeof content[0]?.text === 'string'
              ? content[0].text
              : '';
          assert.equal(JSON.parse(text).error, 'batch_not_recordable');
          assert.deepStrictEqual(seen, []);
        } finally {
          await client.close();
        }
      },
    );
  }
});
