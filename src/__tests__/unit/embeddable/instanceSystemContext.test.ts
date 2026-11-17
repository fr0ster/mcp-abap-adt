/**
 * `systemContext` is per instance (D26 E3): two `EmbeddableMcpServer`s in one
 * process with different `systemContext.responsible` each create under
 * their own — the option no longer merges into a module-global context, so
 * the second instance does not overwrite the first, and the process
 * context is untouched. A request's own value (a header's scope) still wins.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as z from 'zod';
import { EmbeddableMcpServer } from '../../../embeddable/EmbeddableMcpServer';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import {
  getCreateSystemContext,
  getSystemContext,
  resetSystemContextCache,
} from '../../../lib/systemContext';

/** A tool answering the responsible and master system a create would send. */
const contextProbe = new CompositeHandlersRegistry([
  {
    getName: () => 'context-probe',
    registerHandlers: () => {},
    getHandlers: () => [
      {
        toolDefinition: {
          name: 'ContextProbe',
          description: 'answers the create system context',
          inputSchema: z.object({}),
        },
        call: (async () => {
          const { responsible, masterSystem } = getCreateSystemContext();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ responsible, masterSystem }),
              },
            ],
          };
        }) as never,
      },
    ],
  } as never,
]);

async function probe(server: EmbeddableMcpServer) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'probe', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    const answer = (await client.callTool({
      name: 'ContextProbe',
      arguments: {},
    })) as { content: Array<{ text: string }> };
    return JSON.parse(answer.content[0]?.text ?? '{}');
  } finally {
    await client.close();
  }
}

const saved = process.env.SAP_RESPONSIBLE;
beforeEach(() => {
  delete process.env.SAP_RESPONSIBLE;
  resetSystemContextCache();
});
afterEach(() => {
  if (saved !== undefined) process.env.SAP_RESPONSIBLE = saved;
  resetSystemContextCache();
});

const connection = {
  makeAdtRequest: async () => ({ status: 200, data: '' }),
} as never;

it('two instances each create under their own responsible', async () => {
  const first = new EmbeddableMcpServer({
    connection,
    systemType: 'onprem',
    handlersRegistry: contextProbe,
    systemContext: { responsible: 'FIRST_USER', masterSystem: 'ONE' },
  });
  const second = new EmbeddableMcpServer({
    connection,
    systemType: 'onprem',
    handlersRegistry: contextProbe,
    systemContext: { responsible: 'SECOND_USER' },
  });
  expect(await probe(first)).toEqual({
    responsible: 'FIRST_USER',
    masterSystem: 'ONE',
  });
  expect(await probe(second)).toEqual({ responsible: 'SECOND_USER' });
  // The process context is not the option's.
  expect(getSystemContext()).toEqual({});
});
