/**
 * One kind (the owner, 2026-11-17): the kind a tool is listed for is the
 * kind its call is checked and dispatched on, for every combination of a
 * stated kind, `SAP_SYSTEM_TYPE` at construction (changed after it), a
 * factory record and a declared kind; every disagreement is refused —
 * `system_type_required` with no kind, `system_type_conflict` when the
 * connection's recorded or declared kind is another — and nothing runs.
 *
 * Observed through a probe tool stated per variant: its listed description
 * names the variant it is listed for, and its handler answers the kind of
 * the connection it was dispatched on.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { EmbeddableMcpServer } from '../../embeddable/EmbeddableMcpServer';
import {
  createAbapConnection,
  systemKindOf,
} from '../../lib/connectionFactory';
import { BaseHandlerGroup } from '../../lib/handlers/base/BaseHandlerGroup';
import {
  defineTool,
  type HandlerContext,
  type HandlerEntry,
} from '../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry';
import { declareSystemKind } from '../../lib/systemKind';

type Kind = 'onprem' | 'cloud';
const KINDS = [undefined, 'onprem', 'cloud'] as const;
const other = (kind: Kind): Kind => (kind === 'onprem' ? 'cloud' : 'onprem');

const PROBE = defineTool(
  {
    name: 'KindProbe',
    description: 'listed for no variant',
    inputSchema: z.object({}),
    variants: {
      onprem: { description: 'listed for onprem', inputSchema: z.object({}) },
      cloud: { description: 'listed for cloud', inputSchema: z.object({}) },
    },
  },
  async (context: HandlerContext) => ({
    content: [
      {
        type: 'text' as const,
        text: `dispatched on ${systemKindOf(context.connection) ?? 'none'}`,
      },
    ],
  }),
);

class ProbeGroup extends BaseHandlerGroup {
  protected groupName = 'kind-probe';
  getHandlers(): HandlerEntry[] {
    return [PROBE];
  }
}

const saved = process.env.SAP_SYSTEM_TYPE;
beforeEach(() => {
  mock.method(console, 'error', () => {});
  mock.method(process.stderr, 'write', () => true);
});
afterEach(() => {
  if (saved === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = saved;
  mock.restoreAll();
});

function setEnv(kind: Kind | undefined): void {
  if (kind === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = kind;
}

/** A connection with the factory's record of `record` (or none) and `declared`. */
function connectionWith(record: Kind | undefined, declared: Kind | undefined) {
  const connection =
    record === undefined
      ? {
          getBaseUrl: async () => 'https://system.example.invalid',
          makeAdtRequest: async () => ({ status: 200, data: '' }),
        }
      : createAbapConnection(
          {
            url: 'https://system.example.invalid',
            client: '100',
            authType: 'basic',
          },
          new BasicAuthProvider('KIND_USER', 'kind-password'),
          null,
          undefined,
          undefined,
          record,
        );
  if (declared !== undefined) declareSystemKind(connection, declared);
  return connection;
}

async function listedAndCalled(server: McpServer | EmbeddableMcpServer) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'kind', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    const listed =
      (await client.listTools()).tools.find((t) => t.name === 'KindProbe')
        ?.description ?? '';
    const answer = (await client.callTool({
      name: 'KindProbe',
      arguments: {},
    })) as { content?: Array<{ text?: string }> };
    return {
      listed,
      called: (answer.content ?? []).map((c) => c.text ?? '').join('\n'),
    };
  } finally {
    await client.close();
  }
}

/** What one kind means for a call: refused how, or run on which kind. */
function expectOneKind(
  result: { listed: string; called: string },
  kind: Kind | undefined,
  record: Kind | undefined,
  declared: Kind | undefined,
): void {
  if (kind === undefined) {
    assert.ok(result.called.includes('system_type_required'));
    return;
  }
  assert.equal(result.listed, `listed for ${kind}`);
  const disagrees =
    (record !== undefined && record !== kind) ||
    (declared !== undefined && declared !== kind);
  if (disagrees) {
    assert.ok(result.called.includes('system_type_conflict'));
  } else {
    assert.equal(result.called, `dispatched on ${kind}`);
  }
}

const COMBINATIONS = KINDS.flatMap((stated) =>
  KINDS.flatMap((env) =>
    KINDS.flatMap((record) =>
      KINDS.map((declared) => ({ stated, env, record, declared })),
    ),
  ),
);

for (const { stated, env, record, declared } of COMBINATIONS) {
  describe(`stated ${stated}, env ${env}, record ${record}, declared ${declared}`, () => {
    it('the server: listed, checked and dispatched on its one kind', async () => {
      setEnv(env);
      const connection = connectionWith(record, declared);
      const server = new EmbeddableMcpServer({
        connection: connection as never,
        ...(stated !== undefined ? { systemType: stated } : {}),
        handlersRegistry: new CompositeHandlersRegistry([
          new ProbeGroup({ connection: null, logger: undefined } as never),
        ]),
      });
      // The environment changed after construction is not read.
      setEnv(env === undefined ? 'cloud' : other(env));
      expectOneKind(
        await listedAndCalled(server),
        stated ?? env,
        record,
        declared,
      );
    });

    it('a plain registration: listed, checked and dispatched on the group’s kind', async () => {
      setEnv(env);
      const connection = connectionWith(record, declared);
      const context = {
        connection,
        logger: undefined,
        ...(stated !== undefined ? { systemType: stated } : {}),
      } as unknown as HandlerContext;
      const group = new ProbeGroup(context);
      const server = new McpServer({ name: 'plain', version: '1.0.0' });
      group.registerOneTool(server, PROBE, async () => context);
      // The environment is never the group's kind.
      expectOneKind(await listedAndCalled(server), stated, record, declared);
    });
  });
}
