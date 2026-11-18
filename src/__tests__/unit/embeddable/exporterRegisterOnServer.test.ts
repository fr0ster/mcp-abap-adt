/**
 * `HandlerExporter.registerOnServer(mcpServer, connectionProvider)`: the
 * exporter's tools on an embedder's own `McpServer`, each call on the
 * connection the provider returns for it. The listing is a plain
 * registration's (`createRegistry().registerAllTools`) for the exporter's
 * stated `systemType`; each call awaits the provider (sync or async) and runs
 * the handler on that connection, in the form it takes, as a server instance
 * does. A provider that fails is the call's answer, and the handler does not
 * run.
 */

import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CompactReadOnlyHandlersGroup } from '../../../../compact-readonly-entries/src/group';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import {
  CONNECTION_PROVIDER_FAILED_WORDS,
  CREDENTIALS_REQUIRED_WORDS,
  ServerRefusal,
  SYSTEM_TYPE_REQUIRED_WORDS,
} from '../../../lib/auth/serverRefusal';
import {
  createAbapConnection,
  systemKindOf,
} from '../../../lib/connectionFactory';
import { noopLogger } from '../../../lib/handlerLogger';
import {
  type ConnectionProvider,
  HandlerExporter,
} from '../../../lib/handlers/HandlerExporter';
import type { SapEnvironment } from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import {
  BACKGROUND_NOT_FOR_RUN_WORDS,
  isLongTool,
} from '../../../lib/longTools';
import { adtStandIn } from '../../helpers/adtStandIn';
import { type Counting, countingConnection } from '../../helpers/batchHarness';
import { silentLogger } from '../../helpers/lowToCompact';

type Listed = Awaited<ReturnType<Client['listTools']>>['tools'];

const exporterFor = (systemType?: SapEnvironment) =>
  new HandlerExporter({
    logger: silentLogger,
    ...(systemType !== undefined && { systemType }),
  });

async function clientOf(server: McpServer): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'register-on-server', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

async function listedOn(server: McpServer): Promise<Listed> {
  const client = await clientOf(server);
  try {
    const { tools } = await client.listTools();
    return [...tools].sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    await client.close();
  }
}

/** The exporter's tools on a server of the embedder's, on `provider`. */
function registeredOn(
  provider: ConnectionProvider,
  systemType?: SapEnvironment,
): McpServer {
  const server = new McpServer({ name: 'embedder', version: '1.0.0' });
  exporterFor(systemType).registerOnServer(server, provider);
  return server;
}

async function call(
  server: McpServer,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const client = await clientOf(server);
  try {
    return JSON.stringify(await client.callTool({ name, arguments: args }));
  } finally {
    await client.close();
  }
}

const GET_PROGRAM: Record<string, unknown> = { program_name: 'ZPLACEHOLDER' };
const GET_PROGRAM_SENT =
  'GET /sap/bc/adt/programs/programs/zplaceholder/source/main?version=active';

const previous = process.env.SAP_SYSTEM_TYPE;
beforeEach(() => {
  delete process.env.SAP_SYSTEM_TYPE;
});
after(() => {
  if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previous;
});

describe('HandlerExporter.registerOnServer lists', () => {
  for (const systemType of [
    'cloud',
    'onprem',
    undefined,
  ] satisfies ReadonlyArray<SapEnvironment | undefined>) {
    it(
      format(
        'what a plain registration of the exporter lists where %s is stated',
        systemType,
      ),
      async () => {
        const plain = new McpServer({ name: 'plain', version: '1.0.0' });
        exporterFor(systemType).createRegistry().registerAllTools(plain);
        const counting = countingConnection('document', undefined);
        const listed = await listedOn(
          registeredOn(() => counting.connection, systemType),
        );
        assert.deepStrictEqual(listed, await listedOn(plain));
        assert.ok(listed.length > 0);
      },
    );
  }

  it('cloud and onprem differently (the comparison is not vacuous)', async () => {
    const connection = countingConnection('document', undefined).connection;
    // Compared as JSON data: a key present as `undefined`, or a prototype,
    // is no difference here, as for Jest's not.toEqual.
    assert.notDeepStrictEqual(
      JSON.parse(
        JSON.stringify(await listedOn(registeredOn(() => connection, 'cloud'))),
      ),
      JSON.parse(
        JSON.stringify(
          await listedOn(registeredOn(() => connection, 'onprem')),
        ),
      ),
    );
  });
});

describe('HandlerExporter.registerOnServer calls', () => {
  it('each call on the connection the provider returns, asking the provider again for every call', async () => {
    const first = countingConnection('document', undefined);
    const second = countingConnection('document', undefined);
    const given = [first, second];
    let asked = 0;
    const server = registeredOn(() => {
      const next = given[asked];
      asked += 1;
      if (next === undefined) throw new Error('asked more than twice');
      return next.connection;
    }, 'onprem');
    const client = await clientOf(server);
    try {
      await client.callTool({ name: 'GetProgram', arguments: GET_PROGRAM });
      assert.equal(asked, 1);
      assert.deepStrictEqual(first.sent, [GET_PROGRAM_SENT]);
      assert.deepStrictEqual(second.sent, []);
      await client.callTool({ name: 'GetProgram', arguments: GET_PROGRAM });
      assert.equal(asked, 2);
      assert.deepStrictEqual(first.sent, [GET_PROGRAM_SENT]);
      assert.deepStrictEqual(second.sent, [GET_PROGRAM_SENT]);
    } finally {
      await client.close();
    }
  });

  it('with an async provider', async () => {
    const counting = countingConnection('document', undefined);
    const answer = await call(
      registeredOn(async () => {
        await new Promise<void>((resolve) => setImmediate(resolve));
        return counting.connection;
      }, 'onprem'),
      'GetProgram',
      GET_PROGRAM,
    );
    assert.ok(!answer.includes('"isError":true'));
    assert.deepStrictEqual(counting.sent, [GET_PROGRAM_SENT]);
  });

  it('two calls at once, each on its own connection, whichever provider answers first', async () => {
    const slow = countingConnection('document', undefined);
    const fast = countingConnection('document', undefined);
    let releaseSlow: () => void = () => {};
    const slowGiven = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    let asked = 0;
    const server = registeredOn(async () => {
      asked += 1;
      if (asked === 1) {
        await slowGiven;
        return slow.connection;
      }
      return fast.connection;
    }, 'onprem');
    const client = await clientOf(server);
    try {
      const slowCall = client.callTool({
        name: 'GetProgram',
        arguments: { program_name: 'ZSLOW' },
      });
      // The second call is asked for only after the first one is.
      while (asked < 1) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      await client.callTool({
        name: 'GetProgram',
        arguments: { program_name: 'ZFAST' },
      });
      releaseSlow();
      await slowCall;
      assert.deepStrictEqual(fast.sent, [
        'GET /sap/bc/adt/programs/programs/zfast/source/main?version=active',
      ]);
      assert.deepStrictEqual(slow.sent, [
        'GET /sap/bc/adt/programs/programs/zslow/source/main?version=active',
      ]);
    } finally {
      await client.close();
    }
  });

  for (const [_label, provider] of [
    [
      'rejects',
      async () => {
        throw new Error('PROVIDER_SECRET_WORDS');
      },
    ],
    [
      'throws',
      () => {
        throw new Error('PROVIDER_SECRET_WORDS');
      },
    ],
  ] satisfies ReadonlyArray<
    [string, () => IAbapConnection | Promise<IAbapConnection>]
  >) {
    it(
      format(
        'a provider that %s is the answer: connection_provider_failed in fixed words, the handler does not run',
        _label,
      ),
      async () => {
        const answer = await call(
          registeredOn(provider, 'onprem'),
          'GetProgram',
          GET_PROGRAM,
        );
        assert.ok(answer.includes('"isError":true'));
        assert.ok(answer.includes('connection_provider_failed'));
        assert.ok(answer.includes(CONNECTION_PROVIDER_FAILED_WORDS));
        assert.ok(!answer.includes('PROVIDER_SECRET_WORDS'));
      },
    );
  }

  it("a provider's credential failure is answered as it came", async () => {
    const answer = await call(
      registeredOn(async () => {
        throw new ServerRefusal('credentials_required');
      }, 'onprem'),
      'GetProgram',
      GET_PROGRAM,
    );
    assert.ok(answer.includes('"isError":true'));
    assert.ok(answer.includes('credentials_required'));
    assert.ok(answer.includes(CREDENTIALS_REQUIRED_WORDS));
    assert.ok(!answer.includes('connection_provider_failed'));
  });

  it('with no systemType stated and SAP_SYSTEM_TYPE=cloud, a call is refused system_type_required, nothing sent', async () => {
    process.env.SAP_SYSTEM_TYPE = 'cloud';
    const counting = countingConnection('document', undefined);
    const answer = await call(
      registeredOn(() => counting.connection),
      'GetProgram',
      GET_PROGRAM,
    );
    assert.ok(answer.includes('"isError":true'));
    assert.ok(answer.includes(SYSTEM_TYPE_REQUIRED_WORDS));
    assert.deepStrictEqual(counting.sent, []);
    assert.equal(systemKindOf(counting.connection), undefined);
  });

  for (const [systemType, environment] of [
    ['cloud', 'onprem'],
    ['onprem', 'cloud'],
  ] satisfies ReadonlyArray<[SapEnvironment, string]>) {
    it(
      format(
        'with systemType %s stated, the call runs on it whatever SAP_SYSTEM_TYPE (%s) says',
        systemType,
        environment,
      ),
      async () => {
        process.env.SAP_SYSTEM_TYPE = environment;
        const counting = countingConnection('document', undefined);
        await call(
          registeredOn(() => counting.connection, systemType),
          'GetProgram',
          GET_PROGRAM,
        );
        assert.equal(systemKindOf(counting.connection), systemType);
        assert.deepStrictEqual(counting.sent, [GET_PROGRAM_SENT]);
      },
    );
  }
});

/**
 * Each tool answers as it does through an `EmbeddableMcpServer` holding the
 * same exporter's registry on the same kind of connection: args-only
 * handlers (`(args) => handleX(this.context, args)`) — every tool the
 * exporter hands out takes that form — and a long read.
 */
describe('HandlerExporter.registerOnServer answers as an EmbeddableMcpServer', () => {
  async function onExporter(name: string, args: Record<string, unknown>) {
    const counting = countingConnection('document', undefined);
    const answer = await call(
      registeredOn(() => counting.connection, 'onprem'),
      name,
      args,
    );
    return { answer, sent: counting.sent };
  }

  async function onEmbeddable(name: string, args: Record<string, unknown>) {
    const counting: Counting = countingConnection('document', undefined);
    const embedded = new EmbeddableMcpServer({
      connection: counting.connection,
      systemType: 'onprem',
      logger: noopLogger,
      handlersRegistry: exporterFor('onprem').createRegistry(),
    });
    return { answer: await call(embedded, name, args), sent: counting.sent };
  }

  for (const [_label, name, args] of [
    ['a readonly tool (args-only)', 'GetProgram', GET_PROGRAM],
    [
      'a high-level mutating tool (args-only, in its critical section)',
      'DeleteClass',
      { class_name: 'ZCL_PLACEHOLDER', transport_request: 'E19K900001' },
    ],
  ] satisfies ReadonlyArray<[string, string, Record<string, unknown>]>) {
    it(format('%s', _label), async () => {
      const exported = await onExporter(name, args);
      const embedded = await onEmbeddable(name, args);
      assert.deepStrictEqual(exported, embedded);
      assert.ok(!exported.answer.includes('Cannot read properties'));
      assert.ok(exported.sent.length > 0);
    });
  }

  it('a long read, on a connection of its own made from the call’s', async () => {
    assert.equal(isLongTool('SearchObject'), true);
    async function searched(
      register: (connection: IAbapConnection) => McpServer,
    ): Promise<{ answer: string; requests: string[] }> {
      const standIn = await adtStandIn();
      try {
        process.env.SAP_SYSTEM_TYPE = 'onprem';
        const connection = createAbapConnection(
          { url: standIn.url, client: '100', authType: 'basic' },
          new BasicAuthProvider('LONG_USER', 'long-password'),
        );
        await connection.connect();
        const before = standIn.requests.length;
        const answer = await call(register(connection), 'SearchObject', {
          object_name: 'ZPLACEHOLDER*',
        });
        return {
          answer,
          requests: standIn.requests
            .slice(before)
            .map((request) => `${request.method} ${request.url}`)
            .filter((line) => line.includes('/repository/informationsystem/')),
        };
      } finally {
        await standIn.close();
      }
    }
    const exported = await searched((connection) =>
      registeredOn(() => connection, 'onprem'),
    );
    const embedded = await searched(
      (connection) =>
        new EmbeddableMcpServer({
          connection,
          systemType: 'onprem',
          logger: noopLogger,
          handlersRegistry: exporterFor('onprem').createRegistry(),
        }),
    );
    assert.deepStrictEqual(exported, embedded);
    assert.ok(exported.requests.length > 0);
  });
});

/**
 * A group registered on its own keeps no background runs: a listed long
 * tool is listed there without `background`, so the parameter never reaches
 * the path — the call runs in the call, its run mode on the call's
 * connection. This goes through the path `registerOnServer` registers by
 * (`registerHandlersOnCall`), on the compact group that has a run mode.
 */
describe('registerHandlersOnCall (the path registerOnServer registers by)', () => {
  for (const systemType of ['onprem', 'cloud'] as const) {
    it(
      format(
        'on %s every compact long tool is listed answering in the call',
        systemType,
      ),
      async () => {
        const server = new McpServer({ name: 'per-call', version: '1.0.0' });
        new CompactReadOnlyHandlersGroup({
          ...noConnectionContext(),
          systemType,
        }).registerHandlersOnCall(server, async () => ({
          connection: countingConnection('document', undefined).connection,
          logger: silentLogger,
          systemType,
        }));
        const client = await clientOf(server);
        try {
          const { tools } = await client.listTools();
          const long = tools.filter((t) => isLongTool(t.name));
          assert.ok(long.length > 3);
          for (const tool of long) {
            assert.deepStrictEqual(
              {
                tool: tool.name,
                handle: (tool.description ?? '').includes('run_handle'),
                inCall: (tool.description ?? '').includes(
                  'Runs on an ABAP session of its own and answers its result in the call.',
                ),
              },
              { tool: tool.name, handle: false, inCall: true },
            );
          }
        } finally {
          await client.close();
        }
      },
    );
  }

  it('lists HandlerGet without background, and a run mode runs in the call on the call context', async () => {
    let asked = 0;
    const counting = countingConnection('document', undefined);
    const server = new McpServer({ name: 'per-call', version: '1.0.0' });
    new CompactReadOnlyHandlersGroup({
      ...noConnectionContext(),
      systemType: 'onprem',
    }).registerHandlersOnCall(server, async () => {
      asked += 1;
      return {
        connection: counting.connection,
        logger: silentLogger,
        systemType: 'onprem',
      };
    });
    const client = await clientOf(server);
    try {
      const listed = await client.listTools();
      const get = listed.tools.find((t) => t.name === 'HandlerGet');
      assert.ok(
        !Object.keys(get?.inputSchema.properties ?? {}).includes('background'),
      );
      assert.ok(
        (get?.description ?? '').includes(
          'Runs on an ABAP session of its own and answers its result in the call.',
        ),
      );
      assert.ok(!(get?.description ?? '').includes('run_handle'));
    } finally {
      await client.close();
    }
    const answer = await call(server, 'HandlerGet', {
      object_type: 'UNIT_TEST',
      run_id: 'run-placeholder-1',
      background: true,
    });
    assert.ok(!answer.includes(BACKGROUND_NOT_FOR_RUN_WORDS));
    assert.equal(asked, 1);
  });
});
