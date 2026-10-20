/**
 * Plain-node scenario (`plainNode.ts`): an instance with a batch open and
 * two calls recorded, then the batch's end without `BatchEnd` —
 *
 * - `close`: the instance close (`closeInstance`);
 * - `dispose`: the state's undo (what the idle bound and the pool run).
 *
 * The recorded handlers are written as a handler that does not guard its
 * parts: one awaits its one part and lets its failure throw; the other
 * records two parts and awaits them one after the other, so when the first
 * fails it never reads the second. Reports what was sent, whether every
 * recorded handler settled, and every unhandled rejection the process saw.
 */
import { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { EmbeddableMcpServer } from '../../../../embeddable/EmbeddableMcpServer';
import { InstanceBatch } from '../../../../lib/batch/InstanceBatch';
import { LateBoundConnection } from '../../../../lib/batch/lateBound';
import type {
  HandlerContext,
  HandlerEntry,
  IHandlerGroup,
} from '../../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../../lib/handlers/registry/CompositeHandlersRegistry';
import { closeInstance } from '../../../../lib/instanceClose';
import { HandlerLedger } from '../../../helpers/handlerLedger';
import {
  recordUnhandled,
  report,
  turns,
} from '../../../helpers/plainNodeRecorder';

recordUnhandled();

const how = process.argv[2] === 'dispose' ? 'dispose' : 'close';

/** The instance's connection: counts every request that reaches it. */
const direct: string[] = [];
const connection = {
  connect: async () => undefined,
  getBaseUrl: async () => 'https://system.invalid',
  getSessionId: () => null,
  setSessionType: () => undefined,
  getSessionType: () => 'stateless' as const,
  makeAdtRequest: async (request: IAbapRequestOptions) => {
    direct.push(request.url);
    return { status: 200, statusText: 'OK', headers: {}, data: '' };
  },
};

type Handler = (context: HandlerContext, args: never) => Promise<unknown>;

const tool = (name: string, property: string, handler: Handler) =>
  ({
    toolDefinition: {
      name,
      description: name,
      inputSchema: {
        type: 'object',
        properties: { [property]: { type: 'string' } },
      },
    },
    handler: handler as never,
  }) as HandlerEntry;

const group = {
  getName: () => 'batch-drop',
  getHandlers: () => [
    tool('GetProgram', 'program_name', async (context, _args) => {
      await context.connection.makeAdtRequest({
        url: '/sap/bc/adt/programs/programs/prog_a/source/main',
        method: 'GET',
        timeout: 0,
      });
      return { isError: false, content: [{ type: 'text', text: 'a' }] };
    }),
    tool('GetInterface', 'interface_name', async (context, _args) => {
      const first = context.connection.makeAdtRequest({
        url: '/sap/bc/adt/oo/interfaces/if_a/source/main',
        method: 'GET',
        timeout: 0,
      });
      const second = context.connection.makeAdtRequest({
        url: '/sap/bc/adt/oo/interfaces/if_a',
        method: 'GET',
        timeout: 0,
      });
      await first;
      await second;
      return { isError: false, content: [{ type: 'text', text: 'b' }] };
    }),
  ],
  registerHandlers: () => undefined,
} as unknown as IHandlerGroup;

const ledger = new HandlerLedger();

(async () => {
  const owner = new InstanceBatch({ keepRawParts: false });
  const target = new LateBoundConnection();
  const batch = new AdtBatchConnection(target, { endpoint: 'communication' });
  let executes = 0;
  const execute = batch.execute.bind(batch);
  batch.execute = (() => {
    executes += 1;
    return execute();
  }) as typeof batch.execute;
  owner.begin('communication', { connection: batch, target, recorded: [] });

  const server = new EmbeddableMcpServer({
    connection: connection as never,
    handlersRegistry: new CompositeHandlersRegistry([ledger.watch(group)]),
    systemType: 'onprem',
    logger: { info() {}, debug() {}, warn() {}, error() {} } as never,
    batch: owner,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'batch-drop', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

  const answers = [
    await client.callTool({
      name: 'GetProgram',
      arguments: { program_name: 'PROG_A' },
    }),
    await client.callTool({
      name: 'GetInterface',
      arguments: { interface_name: 'IF_A' },
    }),
  ];
  const recorded = [...(owner.opened()?.recorded ?? [])];
  const signal = owner.signal();

  if (how === 'close') await closeInstance(server);
  else await server.dispose();

  await turns();
  const settled = ledger.allEnded();
  report({
    callAnswers: answers.map((a) => a.content),
    numbers: recorded.map((call) => call.number),
    mode: owner.mode(),
    holdsState: owner.holdsState(),
    signalAborted: signal.aborted,
    executes,
    direct,
    settled,
  });
})().catch((error: unknown) => {
  process.stderr.write(
    `scenario failed: ${error instanceof Error ? error.stack : 'value'}\n`,
  );
  process.exit(1);
});
