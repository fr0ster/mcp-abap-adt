/**
 * D5 on `BaseMcpServer`'s other registration path: a handlers registry that
 * is not a `CompositeHandlersRegistry` registers its own tools
 * (`registerAllTools`). Those tools go through the same wrapper — the
 * request's signal, the registry of live calls, the request signal scope —
 * so a cancelled request never reaches them either.
 *
 * The request and its cancel notification are delivered back to back on an
 * in-memory transport, so the cancel is processed before the tool would run.
 */

import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { activeTools } from '../../../lib/activeTools';
import type { IHandlersRegistry } from '../../../lib/handlers/interfaces';
import { currentRequestSignal } from '../../../lib/requestSignal';

const silent = { info() {}, debug() {}, warn() {}, error() {} };

/** A registry that registers its tools itself, through `registerTool`. */
function ownRegistry(reached: jest.Mock): IHandlersRegistry {
  return {
    registerAllTools(server: McpServer) {
      server.registerTool(
        'OwnTool',
        { description: 'registered by its own registry' },
        async () => {
          reached(currentRequestSignal());
          return { content: [{ type: 'text', text: 'reached' }] };
        },
      );
    },
    registerTool() {},
    getRegisteredTools: () => ['OwnTool'],
  };
}

class OwnRegistryServer extends BaseMcpServer {
  constructor(registry: IHandlersRegistry) {
    super({ name: 'own-registry', version: '1.0.0', logger: silent });
    this.registerHandlers(registry);
  }
}

async function until(done: () => boolean): Promise<void> {
  for (let turn = 0; turn < 2_000; turn += 1) {
    if (done()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('the condition never held');
}

let stderr: string[];

beforeEach(() => {
  stderr = [];
  jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function serve(reached: jest.Mock) {
  const server = new OwnRegistryServer(ownRegistry(reached));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const answers: JSONRPCMessage[] = [];
  clientSide.onmessage = (message) => {
    answers.push(message);
  };
  await clientSide.start();
  await server.connect(serverSide);
  const call = (id: number): JSONRPCMessage => ({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: 'OwnTool', arguments: {} },
  });
  return { server, clientSide, answers, call };
}

it('(control) a call reaches a tool its own registry registered, inside the request signal scope', async () => {
  const reached = jest.fn();
  const { server, clientSide, answers, call } = await serve(reached);
  await clientSide.send(call(1));
  await until(() => answers.length === 1);
  expect(reached).toHaveBeenCalledTimes(1);
  expect(reached.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
  expect(activeTools()).toHaveLength(0);
  await server.close();
});

it('a cancelled call never reaches a tool its own registry registered', async () => {
  const reached = jest.fn();
  const { server, clientSide, call } = await serve(reached);
  const sent = clientSide.send(call(2));
  const cancelled = clientSide.send({
    jsonrpc: '2.0',
    method: 'notifications/cancelled',
    params: { requestId: 2, reason: 'the client cancelled' },
  });
  await Promise.all([sent, cancelled]);
  await until(() => stderr.join('').includes('[MCP] request_aborted'));
  await until(() => activeTools().length === 0);
  expect(reached).not.toHaveBeenCalled();
  await server.close();
});
