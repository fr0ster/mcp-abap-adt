/**
 * MCP tools for runtime SAP system switching (stdio only).
 *
 * These are registered by the server rather than by a handler group, because
 * they act on the server's connection and tool registry — not on an
 * established ABAP connection like every handler in HandlerContext does.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { SystemSwitcher } from './SystemSwitcher.js';

export const LIST_SYSTEMS_TOOL = {
  name: 'ListSystems',
  description:
    '[read-only] List the SAP systems this server can switch to, discovered from .env connection profiles ' +
    '(current directory, the directory of the launch .env, and the sessions folder). ' +
    'Each entry shows name, URL, client, system type (cloud/onprem/legacy), connection type (http/rfc) and master system, ' +
    'and marks the currently active one. Use this before SwitchSystem to learn the valid names.',
} as const;

export const SWITCH_SYSTEM_TOOL = {
  name: 'SwitchSystem',
  description:
    'Point this MCP server at a different SAP system without restarting the client. ' +
    'Accepts a name from ListSystems (e.g. "kalog") or a path to a .env file. ' +
    'Closes the current connection, loads the new profile, reconnects and verifies it — if that fails the previous system is restored. ' +
    'All subsequent tool calls target the new system. The available tool list may change, since some tools are restricted ' +
    'by system type (e.g. Programs are not available on ABAP Cloud).',
} as const;

function asToolResult(payload: unknown) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

export function registerSystemSwitchTools(
  server: McpServer,
  switcher: SystemSwitcher,
): void {
  server.registerTool(
    LIST_SYSTEMS_TOOL.name,
    { description: LIST_SYSTEMS_TOOL.description, inputSchema: {} },
    async () => asToolResult(switcher.list()),
  );

  server.registerTool(
    SWITCH_SYSTEM_TOOL.name,
    {
      description: SWITCH_SYSTEM_TOOL.description,
      inputSchema: {
        system: z
          .string()
          .describe(
            'System name from ListSystems (e.g. "kalog", "default") or a path to a .env file.',
          ),
      },
    },
    async ({ system }) => {
      const result = await switcher.switchTo(system);
      return asToolResult({
        success: true,
        ...result,
        note: 'All subsequent tool calls target this system. The tool list may have changed.',
      });
    },
  );
}
