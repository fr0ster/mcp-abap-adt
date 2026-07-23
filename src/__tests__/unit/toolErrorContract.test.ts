import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { AxiosError } from 'axios';
import type { HandlerEntry } from '../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry';
import { BaseMcpServer } from '../../server/BaseMcpServer';

const FORBIDDEN_PREFIX =
  /\bMcpError:\s|\bMCP error -?\d+: |(?:^|\s)(?:Error|ADT error): /;

const STUBS: HandlerEntry[] = [
  {
    toolDefinition: {
      name: 'StubReturnsIsError',
      description: 'returns an isError result',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: async () => ({
      isError: true,
      content: [{ type: 'text', text: 'Domain ZD_NOPE not found' }],
    }),
  },
  {
    toolDefinition: {
      name: 'StubThrowsPlainError',
      description: 'throws a plain Error',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: async () => {
      throw new Error('Failed to read class: ZZ not found');
    },
  },
  {
    toolDefinition: {
      name: 'StubMultiItem',
      description: 'returns multi-item content',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: async () => ({
      isError: true,
      content: [
        { type: 'text', text: 'first item' },
        { type: 'json', json: { second: 'item' } },
      ],
    }),
  },
  {
    toolDefinition: {
      name: 'StubThrowsAxios',
      description: 'throws an AxiosError with a response body',
      inputSchema: { type: 'object', properties: {} },
    },
    handler: async () => {
      const err = new AxiosError('Request failed with status code 404');
      (err as any).response = {
        status: 404,
        statusText: 'Not Found',
        data: '<exc:exception>Resource not found</exc:exception>',
      };
      throw err;
    },
  },
];

class StubGroup {
  getName() {
    return 'stub';
  }
  getHandlers() {
    return STUBS;
  }
  registerHandlers() {
    /* registration goes through BaseMcpServer.registerHandlers */
  }
}

class TestServer extends BaseMcpServer {
  constructor() {
    super({ name: 'test-server', version: '1.0.0' });
    this.registerHandlers(
      new CompositeHandlersRegistry([new StubGroup() as any]),
    );
  }
  // Stubs never touch SAP; bypass the real connection.
  protected async getConnection(): Promise<any> {
    return {} as any;
  }
}

async function connect() {
  const server = new TestServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: 'test', version: '1.0.0' },
    { capabilities: {} },
  );
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return { client, close: () => client.close() };
}

describe('tool error wire contract (#155)', () => {
  it('a handler-returned isError arrives as an isError result, not a protocol error', async () => {
    const { client, close } = await connect();
    const result: any = await client.callTool({
      name: 'StubReturnsIsError',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Domain ZD_NOPE not found');
    await close();
  });

  it('no error text carries a service prefix', async () => {
    const { client, close } = await connect();
    for (const name of [
      'StubReturnsIsError',
      'StubThrowsPlainError',
      'StubMultiItem',
      'StubThrowsAxios',
    ]) {
      const result: any = await client.callTool({ name, arguments: {} });
      expect(result.isError).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      for (const item of result.content) {
        expect(item.text).not.toMatch(FORBIDDEN_PREFIX);
      }
    }
    await close();
  });

  it('multi-item content is preserved, not collapsed into one string', async () => {
    const { client, close } = await connect();
    const result: any = await client.callTool({
      name: 'StubMultiItem',
      arguments: {},
    });
    expect(result.content).toHaveLength(2);
    expect(result.content[0].text).toBe('first item');
    expect(result.content[1].text).toBe(JSON.stringify({ second: 'item' }));
    await close();
  });

  it('an uncaught AxiosError surfaces the ADT response body', async () => {
    const { client, close } = await connect();
    const result: any = await client.callTool({
      name: 'StubThrowsAxios',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Resource not found');
    await close();
  });
});
