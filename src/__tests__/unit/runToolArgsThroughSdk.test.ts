/**
 * The run tools' arguments as a handler receives them through the MCP SDK.
 *
 * The server registers each tool with the zod shape `jsonSchemaToZod` builds
 * from its JSON schema (`BaseMcpServer.registerHandlers`), and the SDK hands
 * the handler the parsed value, so a schema `default` reaches the handler as
 * if the client had sent it. A tool that refuses an argument by its presence
 * (`wait` with `runner: 'sync'`) must therefore carry no `default` for it:
 * 22.0.0's `wait` default refused every sync run whose client sent no `wait`.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { TOOL_DEFINITION as RunFunctionGroupUnitTest } from '../../handlers/unit_test/high/handleRunFunctionGroupUnitTest';
import { TOOL_DEFINITION as RunFunctionModuleUnitTest } from '../../handlers/unit_test/high/handleRunFunctionModuleUnitTest';
import { TOOL_DEFINITION as RunProgramUnitTest } from '../../handlers/unit_test/high/handleRunProgramUnitTest';
import { TOOL_DEFINITION as RunUnitTest } from '../../handlers/unit_test/high/handleRunUnitTest';
import { runnerOf, runnerWaitOf } from '../../handlers/unit_test/shared/runner';
import { jsonSchemaToZod } from '../../lib/handlers/utils/schemaUtils';

const RUNNER_TOOLS = [
  { tool: RunUnitTest, args: { class_name: 'ZCL_A' } },
  { tool: RunProgramUnitTest, args: { program_name: 'ZPROG_A' } },
  { tool: RunFunctionGroupUnitTest, args: { function_group_name: 'ZFG_A' } },
  {
    tool: RunFunctionModuleUnitTest,
    args: { function_group_name: 'ZFG_A', function_module_name: 'Z_FM_A' },
  },
];

/** The arguments the tool's handler receives for a client call with `args`. */
async function received(
  tool: { name: string; inputSchema: object },
  args: Record<string, unknown>,
): Promise<unknown> {
  let seen: unknown;
  const server = new McpServer({ name: 'probe', version: '1.0.0' });
  server.registerTool(
    tool.name,
    { inputSchema: jsonSchemaToZod(tool.inputSchema) },
    async (given: unknown): Promise<CallToolResult> => {
      seen = given;
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
  await client.callTool({ name: tool.name, arguments: args });
  await client.close();
  return seen;
}

describe.each(RUNNER_TOOLS)(
  '$tool.name through the MCP SDK',
  ({ tool, args }) => {
    it('a sync run without wait reaches the handler without wait, and is not refused', async () => {
      const given = await received(tool, { ...args, runner: 'sync' });
      expect(given).not.toHaveProperty('wait');
      expect(runnerOf(given)).toBe('sync');
      expect(runnerWaitOf(given, 'sync')).not.toBeInstanceOf(Error);
    });

    it('a sync run with wait is refused', async () => {
      const given = await received(tool, {
        ...args,
        runner: 'sync',
        wait: true,
      });
      expect(runnerWaitOf(given, 'sync')).toBeInstanceOf(Error);
    });

    it('an async run without wait waits', async () => {
      const given = await received(tool, args);
      expect(runnerOf(given)).toBe('async');
      expect(runnerWaitOf(given, 'async')).toBe(true);
    });
  },
);
