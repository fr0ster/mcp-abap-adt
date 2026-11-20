import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { AxiosError } from 'axios';
import * as z from 'zod';
import { BaseMcpServer } from '../../embeddable/BaseMcpServer';
import { BaseHandlerGroup } from '../../lib/handlers/base/BaseHandlerGroup';
import type { HandlerEntry } from '../../lib/handlers/interfaces';
import { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry';
import { withSystemInformation } from '../helpers/systemInformationStandIn';
import { stateSystemKind } from '../helpers/systemKind';

// The system kind is required: the stand-in's is stated for every case.
beforeEach(() => {
  stateSystemKind();
});

const FORBIDDEN_PREFIX =
  /\bMcpError:\s|\bMCP error -?\d+: |(?:^|\s)(?:Error|ADT error): /;

const STUBS: HandlerEntry[] = [
  {
    toolDefinition: {
      name: 'StubReturnsIsError',
      description: 'returns an isError result',
      inputSchema: z.object({}),
    },
    call: async () => ({
      isError: true,
      content: [{ type: 'text', text: 'Domain ZD_NOPE not found' }],
    }),
  },
  {
    toolDefinition: {
      name: 'StubThrowsPlainError',
      description: 'throws a plain Error',
      inputSchema: z.object({}),
    },
    call: async () => {
      throw new Error('Failed to read class: ZZ not found');
    },
  },
  {
    toolDefinition: {
      name: 'StubMultiItem',
      description: 'returns multi-item content',
      inputSchema: z.object({}),
    },
    call: async () => ({
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
      inputSchema: z.object({}),
    },
    call: async () => {
      const err = new AxiosError('Request failed with status code 404');
      (err as any).response = {
        status: 404,
        statusText: 'Not Found',
        data: '<exc:exception>Resource not found</exc:exception>',
      };
      throw err;
    },
  },
  {
    // A custom/external handler group is free to throw the SDK's own McpError,
    // whose `.message` is `MCP error <code>: <text>`. The boundary must strip
    // that prefix so external handlers get the same clean contract as built-in
    // ones. (Built-in handlers no longer throw McpError — see noMcpErrorInSrc.)
    toolDefinition: {
      name: 'StubThrowsMcpError',
      description: 'throws an SDK McpError, as an external handler group might',
      inputSchema: z.object({}),
    },
    call: async () => {
      throw new McpError(ErrorCode.InvalidParams, 'object_name is required');
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
    return withSystemInformation() as any;
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
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, 'Domain ZD_NOPE not found');
    await close();
  });

  it('no error text carries a service prefix', async () => {
    const { client, close } = await connect();
    for (const name of [
      'StubReturnsIsError',
      'StubThrowsPlainError',
      'StubMultiItem',
      'StubThrowsAxios',
      'StubThrowsMcpError',
    ]) {
      const result: any = await client.callTool({ name, arguments: {} });
      assert.equal(result.isError, true);
      assert.ok(result.content.length > 0);
      for (const item of result.content) {
        assert.doesNotMatch(item.text, FORBIDDEN_PREFIX);
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
    assert.equal(result.content.length, 2);
    assert.equal(result.content[0].text, 'first item');
    assert.equal(result.content[1].text, JSON.stringify({ second: 'item' }));
    await close();
  });

  it('an uncaught AxiosError surfaces the ADT response body', async () => {
    const { client, close } = await connect();
    const result: any = await client.callTool({
      name: 'StubThrowsAxios',
      arguments: {},
    });
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('Resource not found'));
    await close();
  });

  it('an SDK McpError thrown by a handler arrives stripped of its code prefix', async () => {
    const { client, close } = await connect();
    const result: any = await client.callTool({
      name: 'StubThrowsMcpError',
      arguments: {},
    });
    assert.equal(result.isError, true);
    // McpError.message is `MCP error -32602: object_name is required`; the
    // boundary must deliver the bare text.
    assert.equal(result.content[0].text, 'object_name is required');
    await close();
  });
});

describe('BaseHandlerGroup registration path honours the same contract (#155)', () => {
  it('returns isError with unprefixed, uncollapsed content for all five cases', async () => {
    // Note: BaseHandlerGroup/McpServer are imported statically at module
    // scope above, not via dynamic import(). Static import carries the same
    // module instances the runtime uses, so the test still exercises the real
    // registration path.

    // BaseHandlerGroup declares `protected abstract groupName: string` and takes
    // a HandlerContext in its constructor; both must be satisfied.
    class Group extends BaseHandlerGroup {
      protected groupName = 'stub-group';
      getHandlers() {
        // All five stubs: the fallback path must honour the same contract,
        // including the try/catch that routes throws through return_error.
        return STUBS;
      }
    }

    const server = new McpServer({ name: 'group-test', version: '1.0.0' });
    const group = new Group({
      connection: withSystemInformation() as any,
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
    assert.equal(single.isError, true);
    assert.equal(single.content[0].text, 'Domain ZD_NOPE not found');

    const thrown: any = await client.callTool({
      name: 'StubThrowsPlainError',
      arguments: {},
    });
    assert.equal(thrown.isError, true);
    assert.equal(thrown.content[0].text, 'Failed to read class: ZZ not found');

    const multi: any = await client.callTool({
      name: 'StubMultiItem',
      arguments: {},
    });
    assert.equal(multi.content.length, 2);
    assert.equal(multi.content[0].text, 'first item');
    assert.equal(multi.content[1].text, JSON.stringify({ second: 'item' }));

    const axios: any = await client.callTool({
      name: 'StubThrowsAxios',
      arguments: {},
    });
    assert.equal(axios.isError, true);
    assert.ok(axios.content[0].text.includes('Resource not found'));

    const mcp: any = await client.callTool({
      name: 'StubThrowsMcpError',
      arguments: {},
    });
    assert.equal(mcp.isError, true);
    assert.equal(mcp.content[0].text, 'object_name is required');

    for (const result of [single, thrown, multi, axios, mcp]) {
      for (const item of result.content) {
        assert.doesNotMatch(item.text, FORBIDDEN_PREFIX);
      }
    }

    await client.close();
  });
});
