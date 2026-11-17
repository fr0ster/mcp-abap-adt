/**
 * `systemContext` is per instance (D26 E3): two `EmbeddableMcpServer`s in one
 * process with different `systemContext.responsible` each create under
 * their own — the option no longer merges into a module-global context, so
 * the second instance does not overwrite the first, and the process
 * context is untouched. A request's own value (a header's scope) still wins.
 * On a connection the host injected it names a background run's caller too.
 */

import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
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
import { shippedGroups } from '../backgroundRuns/harness';

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

it("names a background run's caller on an injected connection", async () => {
  const strategy = new InMemoryBackgroundRuns();
  const listed = jest.spyOn(strategy, 'list');
  const server = new EmbeddableMcpServer({
    connection: {
      getBaseUrl: async () => 'https://system.example.invalid',
      makeAdtRequest: async () => ({ status: 200, data: '' }),
    } as never,
    handlersRegistry: shippedGroups(),
    backgroundRuns: strategy,
    systemContext: { responsible: 'owner_user' },
  });
  const tools = (
    server as unknown as {
      _registeredTools: Record<
        string,
        {
          handler: (
            args: unknown,
          ) => Promise<{ isError?: boolean; content: { text: string }[] }>;
        }
      >;
    }
  )._registeredTools;
  const result = await tools.ListBackgroundRuns.handler({});
  expect(result.content[0]?.text).not.toContain('system_user_unknown');
  expect(result.isError).toBeFalsy();
  expect(listed.mock.calls.at(-1)?.[0].user).toBe('OWNER_USER');
});
