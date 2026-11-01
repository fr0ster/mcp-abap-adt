/**
 * `CreateProgram`'s `program_type` through the MCP SDK's schema conversion:
 * an include is created by `CreateInclude`, so `include` is refused before
 * the handler runs, and the other five values reach it.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { TOOL_DEFINITION } from '../../handlers/program/high/handleCreateProgram';
import { jsonSchemaToZod } from '../../lib/handlers/utils/schemaUtils';

const BASE = { program_name: 'ZPROG_A', package_name: 'ZPKG' };

/** Whether the handler ran, and whether the call came back as an error. */
async function call(
  programType: string,
): Promise<{ ran: boolean; isError: boolean }> {
  let ran = false;
  const server = new McpServer({ name: 'probe', version: '1.0.0' });
  server.registerTool(
    TOOL_DEFINITION.name,
    { inputSchema: jsonSchemaToZod(TOOL_DEFINITION.inputSchema) },
    async (): Promise<CallToolResult> => {
      ran = true;
      return { content: [{ type: 'text', text: 'ok' }] };
    },
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'c', version: '1.0.0' });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  const result = await client.callTool({
    name: TOOL_DEFINITION.name,
    arguments: { ...BASE, program_type: programType },
  });
  await client.close();
  return { ran, isError: result.isError === true };
}

describe('CreateProgram program_type through the MCP SDK', () => {
  it('refuses include before the handler runs', async () => {
    const seen = await call('include');
    expect(seen.ran).toBe(false);
    expect(seen.isError).toBe(true);
  });

  it.each([
    'executable',
    'module_pool',
    'function_group',
    'class_pool',
    'interface_pool',
  ])('passes %s to the handler', async (type) => {
    const seen = await call(type);
    expect(seen.ran).toBe(true);
    expect(seen.isError).toBe(false);
  });

  it('names no include in the description', () => {
    const { program_type } = TOOL_DEFINITION.inputSchema.properties;
    expect(program_type.description).not.toMatch(/include/i);
    expect(program_type.enum).not.toContain('include');
  });
});
