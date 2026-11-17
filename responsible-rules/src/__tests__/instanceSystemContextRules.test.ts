/**
 * An instance's `systemContext` reaches the rules on every path, the
 * injected connection's included: an embedder stating `responsible` and
 * `masterSystem`, with an on-premise connection of its own whose system
 * has no `systeminformation`, gets those as the connection's parameters —
 * not `system_user_unknown` — and a create carries them. No other user is
 * stated (no header, no `SAP_RESPONSIBLE`, no `SAP_USERNAME`).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as z from 'zod';
import { CompositeHandlersRegistry } from '../../../src/lib/handlers/registry/CompositeHandlersRegistry';
import {
  getCreateSystemContext,
  resetSystemContextCache,
} from '../../../src/lib/systemContext';
import { EmbeddableMcpServer } from './helpers/withRules';

const KEYS = [
  'SAP_MASTER_SYSTEM',
  'SAP_RESPONSIBLE',
  'SAP_USERNAME',
  'SAP_SYSTEM_TYPE',
] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetSystemContextCache();
});
afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetSystemContextCache();
});

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

/** A host's on-premise connection whose system has no systeminformation. */
function withoutSystemInformation() {
  const requests: string[] = [];
  const connection = {
    getBaseUrl: async () => 'https://system.example.invalid',
    makeAdtRequest: async (options: { url: string }) => {
      requests.push(options.url);
      return options.url.includes('systeminformation')
        ? { status: 404, data: '' }
        : { status: 200, data: '' };
    },
  };
  return { connection, requests };
}

it('the instance systemContext reaches the rules for an injected connection', async () => {
  const { connection, requests } = withoutSystemInformation();
  const server = new EmbeddableMcpServer({
    connection: connection as never,
    systemType: 'onprem',
    handlersRegistry: contextProbe,
    systemContext: { responsible: 'OWNER', masterSystem: 'SYS' },
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'probe', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    const answer = (await client.callTool({
      name: 'ContextProbe',
      arguments: {},
    })) as { isError?: boolean; content: Array<{ text: string }> };
    const text = answer.content[0]?.text ?? '';
    expect(text).not.toContain('system_user_unknown');
    expect(answer.isError).toBeFalsy();
    expect(JSON.parse(text)).toEqual({
      responsible: 'OWNER',
      masterSystem: 'SYS',
    });
    // The system was asked: the rules made the parameters.
    expect(requests.some((url) => url.includes('systeminformation'))).toBe(
      true,
    );
  } finally {
    await client.close();
  }
});
