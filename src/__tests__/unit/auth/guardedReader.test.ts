/**
 * A reader the answer site does not own — a `BaseMcpServer` override, a
 * host's `readFailure` — may throw. The call is then answered in auth-errors'
 * fixed `unknown` words; nothing of the reader's throw reaches the client.
 */

import { authError } from '@mcp-abap-adt/auth-errors';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import type { ReadFailure } from '../../../lib/auth/failures';
import { CompositeHandlersRegistry } from '../../../lib/handlers/registry/CompositeHandlersRegistry';
import { destinationFailureAnswer } from '../../../lib/httpTransport/destinationRequest';

const READER_SECRET = 'READER-SECRET-7';
const FIXED = authError.unknown({ operation: 'unfamiliar-error' });
const silent = { info() {}, debug() {}, warn() {}, error() {} };

class ThrowingReaderServer extends BaseMcpServer {
  constructor() {
    super({ name: 'test-server', version: '1.0.0', logger: silent });
  }
  protected override readFailure(_thrown: unknown): ReadFailure | undefined {
    throw new Error(`reader failed: ${READER_SECRET}`);
  }
  protected override async getConnection(): Promise<never> {
    throw new Error('no connection');
  }
  register(registry: CompositeHandlersRegistry) {
    this.registerHandlers(registry);
  }
}

const group = {
  getName: () => 'stub',
  getHandlers: () => [
    {
      toolDefinition: {
        name: 'StubTool',
        description: 'a tool',
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async () => ({ content: [{ type: 'text', text: 'read' }] }),
    },
  ],
  registerHandlers: () => {},
};

let stderr: jest.SpyInstance;
beforeEach(() => {
  stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
});
afterEach(() => stderr.mockRestore());

it("the tool wrapper: a reader's throw answers the fixed unknown words", async () => {
  const server = new ThrowingReaderServer();
  server.register(new CompositeHandlersRegistry([group as never]));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  try {
    const result = (await client.callTool({
      name: 'StubTool',
      arguments: {},
    })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(JSON.parse(text)).toEqual({
      error: 'authentication_failed',
      kind: 'unknown',
      message: FIXED.reason,
      ...(FIXED.hint !== undefined ? { hint: FIXED.hint } : {}),
    });
    expect(text).not.toContain(READER_SECRET);
    expect(text).not.toContain('MCP error');
  } finally {
    await client.close();
  }
});

it("the destination answer: a host reader's throw answers the fixed words", () => {
  const answer = destinationFailureAnswer(new Error('x'), () => {
    throw new Error(READER_SECRET);
  });
  expect(answer.text).toBe(
    [FIXED.reason, FIXED.hint].filter(Boolean).join('\n'),
  );
  expect(answer.text).not.toContain(READER_SECRET);
  expect(answer.logLine ?? '').not.toContain(READER_SECRET);
});
