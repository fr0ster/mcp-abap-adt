/**
 * D17: the server's refusals are minted or its own. Behind the closed gate a
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
import * as connectionFactory from '../../../../src/lib/connectionFactory';
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
      expect(answer.ok).toBe(false);
      if (answer.ok) continue;
      expect(isMinted(answer.refusal)).toBe(true);
      expect(answer.refusal.kind).toBe('interactive-login');
      expect(answer.refusal.facts).toEqual({ outcome: 'aborted' });
      expect(answer.refusal.reason).toBe(expected.reason);
    }
    expect(provider.calls).toBe(0);
  });
});

describe('inspection-only mode', () => {
  const TOOL = 'StubTool';

  class StubGroup {
    readonly reached = jest.fn();
    getName() {
      return 'stub';
    }
    getHandlers() {
      return [
        {
          toolDefinition: {
            name: TOOL,
            description: 'a tool that would read the system',
            inputSchema: { type: 'object', properties: {} },
          },
          handler: async () => {
            this.reached();
            return { content: [{ type: 'text', text: 'read' }] };
          },
        },
      ];
    }
    registerHandlers() {}
  }

  it('a tool call answers the inspection_only refusal; no connection is built, no handler runs', async () => {
    const build = jest.spyOn(connectionFactory, 'createAbapConnection');
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
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(INSPECTION_ONLY_WORDS);
      expect(group.reached).not.toHaveBeenCalled();
      expect(build).not.toHaveBeenCalled();
    } finally {
      await client.close();
      build.mockRestore();
    }
  });

  it('the refusal is the server’s own, coded inspection_only', () => {
    const refusal = new ServerRefusal('inspection_only');
    expect(refusal.serverRefusal).toBe('inspection_only');
    expect(refusal.message).toBe(INSPECTION_ONLY_WORDS);
  });
});
