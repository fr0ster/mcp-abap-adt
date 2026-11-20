import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import * as z from 'zod';
/**
 * The server's refusals are minted or its own. Behind the closed gate a
 * provider call answers auth-errors' `interactive-login` `aborted`, never a
 * free-words refusal; inspection-only mode (stdio with no destination)
 * answers the server's own `inspection_only` refusal before any connection
 * is built.
 */

import { authError, isMinted } from '@mcp-abap-adt/auth-errors';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { INSPECTION_ONLY_WORDS, ServerRefusal } from '@mcp-abap-adt/lib/auth';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as connectionFactory from '../../../../../src/lib/connectionFactory';
import { countedProvider, ProviderGate } from '../../auth/countedProvider';
import { StdioServer } from '../../StdioServer';

describe('the closed gate', () => {
  function inner(): IAuthProvider & { calls: number } {
    const self = {
      calls: 0,
      kind: 'inner',
      prepare: async () => {
        self.calls += 1;
        return { ok: true as const };
      },
      establish: async () => {
        self.calls += 1;
        return { ok: true as const };
      },
      authorize: async () => {
        self.calls += 1;
        return { ok: true as const };
      },
      rejected: async () => {
        self.calls += 1;
        return { ok: true as const };
      },
    };
    return self;
  }

  it('answers interactive-login aborted, minted, for each of the four calls; the inner provider is never reached', async () => {
    const gate = new ProviderGate();
    const provider = inner();
    const counted = countedProvider(provider, gate);
    gate.close();
    const expected = authError['interactive-login']({ outcome: 'aborted' });
    const answers = await Promise.all([
      counted.prepare(),
      counted.establish({} as never),
      counted.authorize({} as never),
      counted.rejected({} as never),
    ]);
    for (const answer of answers) {
      assert.equal(answer.ok, false);
      if (answer.ok) continue;
      assert.equal(isMinted(answer.refusal), true);
      assert.equal(answer.refusal.kind, 'interactive-login');
      assert.deepStrictEqual(answer.refusal.facts, { outcome: 'aborted' });
      assert.equal(answer.refusal.reason, expected.reason);
    }
    assert.equal(provider.calls, 0);
  });
});

describe('inspection-only mode', () => {
  const TOOL = 'StubTool';

  class StubGroup {
    readonly reached = mock.fn();
    getName() {
      return 'stub';
    }
    getHandlers() {
      return [
        {
          toolDefinition: {
            name: TOOL,
            description: 'a tool that would read the system',
            inputSchema: z.object({}),
          },
          call: async () => {
            this.reached();
            return { content: [{ type: 'text', text: 'read' }] };
          },
        },
      ];
    }
    registerHandlers() {}
  }

  it('a tool call answers the inspection_only refusal; no connection is built, no handler runs', async (t) => {
    const build = t.mock.method(connectionFactory, 'createAbapConnection');
    const group = new StubGroup();
    const server = new StdioServer(
      new CompositeHandlersRegistry([group as never]),
      undefined,
    );
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([
      server.start(undefined, serverSide),
      client.connect(clientSide),
    ]);
    try {
      const result = (await client.callTool({ name: TOOL, arguments: {} })) as {
        isError?: boolean;
        content: Array<{ text: string }>;
      };
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes(INSPECTION_ONLY_WORDS));
      assert.equal(group.reached.mock.callCount(), 0);
      assert.equal(build.mock.callCount(), 0);
    } finally {
      await client.close();
      build.mock.restore();
    }
  });

  it('the refusal is the server’s own, coded inspection_only', () => {
    const refusal = new ServerRefusal('inspection_only');
    assert.equal(refusal.serverRefusal, 'inspection_only');
    assert.equal(refusal.message, INSPECTION_ONLY_WORDS);
  });
});
