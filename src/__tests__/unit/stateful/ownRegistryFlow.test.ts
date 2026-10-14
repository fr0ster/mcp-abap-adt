/**
 * One MCP session, one connection, one main flow — for a registry that
 * registers its own tools too (`registerAllTools`, not a
 * `CompositeHandlersRegistry`). Its callbacks can reach the instance's
 * connection: the server they are handed is the instance (every member
 * bound), and a subclass's registry may call its protected members. So two
 * calls sent at once send one after the other: the second's first send
 * leaves only once the first call settled.
 *
 * - through the server the registry was handed (`getConnection`);
 * - through the subclass's `onMainConnection`, which inside the call's turn
 *   sends at once (no wait behind itself);
 * - a tool on the list of those that work on a connection of their own (a
 *   debugger tool, a run tool asked for a background run) takes no place in
 *   the flow, as a handler group's does; the same run tool in the foreground
 *   does.
 */

import type { AbapConnection } from '@mcp-abap-adt/connection';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { DEBUGGER_OWN_CONNECTION_TOOLS } from '../../../lib/debugger/ownConnectionTools';
import type { IHandlersRegistry } from '../../../lib/handlers/interfaces';

jest.setTimeout(30_000);

const silent = { info() {}, debug() {}, warn() {}, error() {} };

/** What the connection saw, in order: `start <id>` / `end <id>`. */
type Log = string[];

/**
 * An injected connection whose sends are logged and held until the test
 * lets each go (`release(id)`).
 */
function heldConnection(log: Log) {
  const gates = new Map<string, () => void>();
  const arrived = new Map<string, () => void>();
  const arrivals = new Map<string, Promise<void>>();
  const arrival = (id: string) => {
    let promise = arrivals.get(id);
    if (promise === undefined) {
      promise = new Promise<void>((resolve) => {
        arrived.set(id, resolve);
      });
      arrivals.set(id, promise);
    }
    return promise;
  };
  const connection = {
    async makeAdtRequest(options: { url: string }) {
      const id = options.url;
      log.push(`start ${id}`);
      arrival(id);
      arrived.get(id)?.();
      await new Promise<void>((resolve) => {
        gates.set(id, resolve);
      });
      log.push(`end ${id}`);
      return { status: 200, data: '' };
    },
  } as unknown as AbapConnection;
  return {
    connection,
    arrived: arrival,
    release: (id: string) => gates.get(id)?.(),
  };
}

type Send = (signal: AbortSignal, id: string) => Promise<unknown>;

/** A registry that registers `name` itself; the tool sends `args.id` through `send`. */
function ownRegistry(
  name: string,
  send: (server: McpServer) => Send,
): IHandlersRegistry {
  return {
    registerAllTools(server: McpServer) {
      const sendOn = send(server);
      server.registerTool(
        name,
        {
          description: 'registered by its own registry',
          inputSchema: { id: z.string(), background: z.boolean().optional() },
        },
        async (args: { id: string }, extra: { signal: AbortSignal }) => {
          await sendOn(extra.signal, args.id);
          return { content: [{ type: 'text', text: args.id }] };
        },
      );
    },
    registerTool() {},
    getRegisteredTools: () => [name],
  };
}

/** Through the server it was handed: the instance's `getConnection`. */
const viaHandedServer =
  (server: McpServer): Send =>
  async (signal, id) => {
    const reach = server as unknown as {
      getConnection(signal: AbortSignal): Promise<AbapConnection>;
      connectionReleased(connection: AbapConnection): void;
    };
    const connection = await reach.getConnection(signal);
    try {
      return await connection.makeAdtRequest({ url: id } as never);
    } finally {
      reach.connectionReleased(connection);
    }
  };

class OwnRegistryServer extends BaseMcpServer {
  constructor(
    connection: AbapConnection,
    name: string,
    via: 'handed-server' | 'main-connection',
  ) {
    super({ name: 'own-registry-flow', version: '1.0.0', logger: silent });
    this.setConnectionContext({
      kind: 'injected',
      connection,
      sessionId: 'own-registry-flow',
    });
    this.registerHandlers(
      ownRegistry(
        name,
        via === 'handed-server'
          ? viaHandedServer
          : () => (signal, id) =>
              this.onMainConnection(signal, (taken) =>
                taken.makeAdtRequest({ url: id } as never),
              ),
      ),
    );
  }
}

async function until(done: () => boolean): Promise<void> {
  for (let turn = 0; turn < 2_000; turn += 1) {
    if (done()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('the condition never held');
}

/** Real time for a call that is not queued to reach the connection. */
const settleWhile = () => new Promise((resolve) => setTimeout(resolve, 50));

async function serve(name: string, via: 'handed-server' | 'main-connection') {
  const log: Log = [];
  const held = heldConnection(log);
  const server = new OwnRegistryServer(held.connection, name, via);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const answers: JSONRPCMessage[] = [];
  clientSide.onmessage = (message) => {
    answers.push(message);
  };
  await clientSide.start();
  await server.connect(serverSide);
  const call = (id: number, sent: string, extra: object = {}) =>
    clientSide.send({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: { id: sent, ...extra } },
    });
  return { server, log, held, answers, call };
}

beforeEach(() => {
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it.each<['handed-server' | 'main-connection']>([
  ['handed-server'],
  ['main-connection'],
])(
  'two calls sent at once to a self-registered tool (%s): the second sends only after the first settled',
  async (via) => {
    const s = await serve('OwnSend', via);
    try {
      await Promise.all([s.call(1, 'first'), s.call(2, 'second')]);
      await s.held.arrived('first');
      await settleWhile();
      // The first holds the flow: nothing of the second was sent.
      expect(s.log).toEqual(['start first']);
      s.held.release('first');
      await s.held.arrived('second');
      s.held.release('second');
      await until(() => s.answers.length === 2);
      expect(s.log).toEqual([
        'start first',
        'end first',
        'start second',
        'end second',
      ]);
    } finally {
      await s.server.close();
    }
  },
);

it('a self-registered tool on the own-connection list takes no place in the flow', async () => {
  const name = DEBUGGER_OWN_CONNECTION_TOOLS[0];
  if (name === undefined) throw new Error('no own-connection tool listed');
  const s = await serve(name, 'handed-server');
  try {
    await Promise.all([s.call(1, 'first'), s.call(2, 'second')]);
    await s.held.arrived('first');
    await s.held.arrived('second');
    expect(s.log).toEqual(['start first', 'start second']);
    s.held.release('first');
    s.held.release('second');
    await until(() => s.answers.length === 2);
  } finally {
    await s.server.close();
  }
});

it('a self-registered run tool asked for a background run takes no place in the flow; in the foreground it does', async () => {
  const s = await serve('RuntimeRunClass', 'handed-server');
  try {
    await s.call(1, 'holder');
    await s.held.arrived('holder');
    await s.call(2, 'background', { background: true });
    await s.held.arrived('background');
    await s.call(3, 'foreground');
    await settleWhile();
    expect(s.log).toEqual(['start holder', 'start background']);
    s.held.release('holder');
    s.held.release('background');
    await s.held.arrived('foreground');
    s.held.release('foreground');
    await until(() => s.answers.length === 3);
  } finally {
    await s.server.close();
  }
});
