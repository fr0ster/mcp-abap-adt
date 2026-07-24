import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AxiosError } from 'axios';
import { BaseHandlerGroup } from '../../lib/handlers/base/BaseHandlerGroup';
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

describe('BaseHandlerGroup registration path honours the same contract (#155)', () => {
  it('returns isError with unprefixed, uncollapsed content for all four cases', async () => {
    // Note: BaseHandlerGroup/McpServer are imported statically at module scope
    // above, not via dynamic import() — ts-jest's CommonJS transpilation of this
    // project (see tsconfig.test.json, no "type": "module") does not support
    // `await import()` without the `--experimental-vm-modules` Node flag, which
    // this repo's jest setup does not enable. Static import carries the same
    // module instances the runtime uses, so the test still exercises the real
    // registration path.

    // BaseHandlerGroup declares `protected abstract groupName: string` and takes
    // a HandlerContext in its constructor; both must be satisfied.
    class Group extends BaseHandlerGroup {
      protected groupName = 'stub-group';
      getHandlers() {
        // All four stubs: the fallback path must honour the same contract,
        // including the try/catch that routes throws through return_error.
        return STUBS;
      }
    }

    const server = new McpServer({ name: 'group-test', version: '1.0.0' });
    const group = new Group({
      connection: {} as any,
      logger: undefined as any,
    });
    // Drive registration through the registry — this is the branch production
    // actually takes (BaseMcpServer.registerHandlers falls back to
    // handlersRegistry.registerAllTools(this), which calls
    // group.registerHandlers(server) internally).
    const registry = new CompositeHandlersRegistry([group]);
    registry.registerAllTools(server);

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

    const single: any = await client.callTool({
      name: 'StubReturnsIsError',
      arguments: {},
    });
    expect(single.isError).toBe(true);
    expect(single.content[0].text).toBe('Domain ZD_NOPE not found');

    const thrown: any = await client.callTool({
      name: 'StubThrowsPlainError',
      arguments: {},
    });
    expect(thrown.isError).toBe(true);
    expect(thrown.content[0].text).toBe('Failed to read class: ZZ not found');

    const multi: any = await client.callTool({
      name: 'StubMultiItem',
      arguments: {},
    });
    expect(multi.content).toHaveLength(2);
    expect(multi.content[0].text).toBe('first item');
    expect(multi.content[1].text).toBe(JSON.stringify({ second: 'item' }));

    const axios: any = await client.callTool({
      name: 'StubThrowsAxios',
      arguments: {},
    });
    expect(axios.isError).toBe(true);
    expect(axios.content[0].text).toContain('Resource not found');

    for (const result of [single, thrown, multi, axios]) {
      for (const item of result.content) {
        expect(item.text).not.toMatch(FORBIDDEN_PREFIX);
      }
    }

    await client.close();
  });
});
