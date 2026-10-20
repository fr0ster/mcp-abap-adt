/**
 * Plain-node scenario (`plainNode.ts`): numbers never read (spec §6). A
 * batch of two calls is begun and ended with the served tools, and its
 * envelope answered; number 1 is read, number 2 never. Then —
 *
 * - `replace`: the next batch's end replaces the map;
 * - `close`: the instance close (`closeInstance`).
 *
 * The handler of number 2 does not guard its parts: it records two and
 * awaits them one after the other, so when the first wait ends with the
 * batch's abort it never reads the second. Reports whether every recorded
 * handler settled, the answers read, and every unhandled rejection the
 * process saw.
 */
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { EmbeddableMcpServer } from '../../../../embeddable/EmbeddableMcpServer';
import {
  InstanceBatch,
  type RecordedCall,
} from '../../../../lib/batch/InstanceBatch';
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

const how = process.argv[2] === 'close' ? 'close' : 'replace';

const envelopes: number[] = [];
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
    const parts = innerRequests(request);
    envelopes.push(parts.length);
    return envelopeResponse(
      parts.map(() => ({ status: 200, statusText: 'OK', body: 'part' })),
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
  getName: () => 'unread-numbers',
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

const textOf = (answer: unknown) =>
  JSON.parse(
    (answer as { content: Array<{ text: string }> }).content[0]?.text ?? 'null',
  );

(async () => {
  const owner = new InstanceBatch({ keepRawParts: false });
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
  const client = new Client({ name: 'unread-numbers', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const call = (name: string, args: Record<string, unknown> = {}) =>
    client.callTool({ name, arguments: args });

  await call('BatchBegin');
  await call('GetProgram', { program_name: 'PROG_A' });
  await call('GetInterface', { interface_name: 'IF_A' });
  const recorded: RecordedCall[] = [...(owner.opened()?.recorded ?? [])];
  const summary = textOf(await call('BatchEnd'));
  const read = textOf(await call('BatchAnswers', { number: 1 }));

  // Number 2 is never read: its handler waits at its first request.
  let unreadSettled = false;
  void recorded[1]?.settled.then(() => {
    unreadSettled = true;
  });
  await turns();
  const settledBefore = unreadSettled;

  if (how === 'replace') {
    await call('BatchBegin');
    await call('BatchEnd');
  } else {
    await closeInstance(server);
  }
  await turns();

  let settled = false;
  void Promise.all(recorded.map((c) => c.settled)).then(() => {
    settled = true;
  });
  await turns();
  report({
    numbers: recorded.map((c) => c.number),
    summary,
    read: read.map((entry: { number: number; content?: unknown }) => [
      entry.number,
      entry.content,
    ]),
    envelopes,
    settledBefore,
    settled,
    holdsState: owner.holdsState(),
  });
})().catch((error: unknown) => {
  process.stderr.write(
    `scenario failed: ${error instanceof Error ? error.stack : 'value'}\n`,
  );
  process.exit(1);
});
