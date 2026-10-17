/**
 * `BaseMcpServer`'s other registration path: a handlers registry that is not
 * a `CompositeHandlersRegistry` registers its own tools (`registerAllTools`).
 * Those tools go through the same wrapper — the call's own signal, the
 * registry of live calls, the request signal scope. A tool call cannot be
 * cancelled: a client's cancel aborts nothing, and the callback is handed
 * the call's signal (the session's end), never the SDK's, which the cancel
 * aborts.
 *
 * The request and its cancel notification are delivered back to back on an
 * in-memory transport, so the cancel is processed before the tool would run.
 */

import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import * as activeToolsModule from '../../../lib/activeTools';
import { activeTools } from '../../../lib/activeTools';
import type { IHandlersRegistry } from '../../../lib/handlers/interfaces';
import { currentRequestSignal } from '../../../lib/requestSignal';

const silent = { info() {}, debug() {}, warn() {}, error() {} };

/** A registry that registers its tools itself, through `registerTool`. */
function ownRegistry(
  reached: jest.Mock,
  seen?: (extraSignal: AbortSignal | undefined) => void,
): IHandlersRegistry {
  return {
    registerAllTools(server: McpServer) {
      server.registerTool(
        'OwnTool',
        { description: 'registered by its own registry' },
        async (extra: { signal?: AbortSignal }) => {
          seen?.(extra.signal);
          const signal = currentRequestSignal();
          reached(signal, signal?.aborted ?? false);
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

/** How many tracked calls have ended on the server since the test began. */
let ended: number;

beforeEach(() => {
  ended = 0;
  jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const register = activeToolsModule.registerActiveTool;
  jest
    .spyOn(activeToolsModule, 'registerActiveTool')
    .mockImplementation((controller, entry) => {
      const remove = register(controller, entry);
      if (remove === undefined) return undefined;
      return () => {
        ended += 1;
        remove();
      };
    });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function serve(
  reached: jest.Mock,
  seen?: (extraSignal: AbortSignal | undefined) => void,
) {
  const server = new OwnRegistryServer(ownRegistry(reached, seen));
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

it('a cancel aborts nothing: the tool its own registry registered runs, its signal not aborted', async () => {
  const reached = jest.fn();
  let extraSignal: AbortSignal | undefined;
  const { server, clientSide, call } = await serve(reached, (signal) => {
    extraSignal = signal;
  });
  const sent = clientSide.send(call(2));
  const cancelled = clientSide.send({
    jsonrpc: '2.0',
    method: 'notifications/cancelled',
    params: { requestId: 2, reason: 'the client cancelled' },
  });
  await Promise.all([sent, cancelled]);
  await until(() => ended === 1);
  await until(() => activeTools().length === 0);
  expect(reached).toHaveBeenCalledTimes(1);
  // Neither the scope's signal nor the one in `extra` was aborted while the
  // tool ran.
  expect(reached.mock.calls[0][1]).toBe(false);
  expect(extraSignal).toBe(reached.mock.calls[0][0]);
  await server.close();
});
