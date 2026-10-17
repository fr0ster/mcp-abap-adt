/**
 * Plain-node scenario (`plainNode.ts`): the instance close begins while
 * `BatchEnd` executes. Two reads are recorded — one stateless batch, one
 * envelope — and `BatchEnd` starts; the envelope is held at the instance's
 * connection, the close begins (the batch dropped), then the envelope is
 * answered. Reports the envelopes that reached the connection (their part
 * counts), the owner's state afterwards, and every unhandled rejection the
 * process saw.
 */
import { AdtBatchConnection } from '@mcp-abap-adt/adt-clients';
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { EmbeddableMcpServer } from '../../../../embeddable/EmbeddableMcpServer';
import { InstanceBatch } from '../../../../lib/batch/InstanceBatch';
import { LateBoundConnection } from '../../../../lib/batch/lateBound';
import { BatchHandlersGroup } from '../../../../lib/handlers/groups/BatchHandlersGroup';
import type {
  HandlerContext,
  HandlerEntry,
  IHandlerGroup,
} from '../../../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../../../lib/handlers/registry/CompositeHandlersRegistry';
import { closeInstance } from '../../../../lib/instanceClose';
import {
  envelopeResponse,
  innerRequests,
} from '../../../helpers/batchEnvelope';
import {
  recordUnhandled,
  report,
  turns,
} from '../../../helpers/plainNodeRecorder';

recordUnhandled();

let arrived!: () => void;
const envelopeArrived = new Promise<void>((resolve) => {
  arrived = resolve;
});
let release!: () => void;
const released = new Promise<void>((resolve) => {
  release = resolve;
});
const envelopes: number[] = [];
const direct: string[] = [];
let session: 'stateful' | 'stateless' = 'stateless';
const connection = {
  connect: async () => undefined,
  getBaseUrl: async () => 'https://system.invalid',
  getSessionId: () => null,
  setSessionType: (type: 'stateful' | 'stateless') => {
    session = type;
  },
  getSessionType: () => session,
  makeAdtRequest: async (request: IAbapRequestOptions) => {
    if (!request.url.endsWith('/batch')) {
      direct.push(request.url);
      return { status: 200, statusText: 'OK', headers: {}, data: '' };
    }
    const parts = innerRequests(request);
    envelopes.push(parts.length);
    arrived();
    await released;
    return envelopeResponse(
      parts.map(() => ({ status: 200, statusText: 'OK', body: '' })),
    );
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
  getName: () => 'close-during-end',
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
      await context.connection.makeAdtRequest({
        url: '/sap/bc/adt/oo/interfaces/if_a/source/main',
        method: 'GET',
        timeout: 0,
      });
      return { isError: false, content: [{ type: 'text', text: 'b' }] };
    }),
  ],
  registerHandlers: () => undefined,
} as unknown as IHandlerGroup;

(async () => {
  const owner = new InstanceBatch({ keepRawParts: false });
  const target = new LateBoundConnection();
  const batch = new AdtBatchConnection(target, { endpoint: 'communication' });
  owner.begin('communication', { connection: batch, target, recorded: [] });

  const server = new EmbeddableMcpServer({
    connection: connection as never,
    handlersRegistry: new CompositeHandlersRegistry([
      group,
      new BatchHandlersGroup({ connection: undefined as never }),
    ]),
    systemType: 'onprem',
    logger: { info() {}, debug() {}, warn() {}, error() {} } as never,
    batch: owner,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'close-during-end', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

  await client.callTool({
    name: 'GetProgram',
    arguments: { program_name: 'PROG_A' },
  });
  await client.callTool({
    name: 'GetInterface',
    arguments: { interface_name: 'IF_A' },
  });
  const recorded = [...(owner.opened()?.recorded ?? [])];

  // BatchEnd's answer never reaches a closed client: its rejection is read.
  let endSettled = false;
  void client
    .callTool({ name: 'BatchEnd', arguments: {} })
    .then(
      () => undefined,
      () => undefined,
    )
    .finally(() => {
      endSettled = true;
    });
  await envelopeArrived;
  const closing = closeInstance(server);
  const modeAtDrop = owner.mode();
  release();
  await closing;
  await turns(40);

  let settled = false;
  void Promise.all(recorded.map((call) => call.answer)).then(() => {
    settled = true;
  });
  await turns();
  report({
    numbers: recorded.map((call) => call.number),
    envelopes,
    direct,
    modeAtDrop,
    mode: owner.mode(),
    holdsState: owner.holdsState(),
    answers: [owner.answer(1) ?? null, owner.answer(2) ?? null],
    settled,
    endSettled,
  });
})().catch((error: unknown) => {
  process.stderr.write(
    `scenario failed: ${error instanceof Error ? error.stack : 'value'}\n`,
  );
  process.exit(1);
});
