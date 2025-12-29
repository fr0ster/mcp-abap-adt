#!/usr/bin/env node
// Simple stdio mode detection (like reference implementation)
// No output suppression needed - dotenv removed, manual .env parsing used

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { HandlerContext } from '../../handlers/interfaces.js';
import { HandlerExporter } from '../../lib/handlers/HandlerExporter.js';
import { jsonSchemaToZod } from '../../lib/handlers/utils/schemaUtils.js';

/**
 * Server class for interacting with ABAP systems via ADT.
 */
export class McpHandlers {
  /**
   * Helper function to register a tool on McpServer
   * Wraps handler to convert our response format to MCP format
   */
  private registerToolOnServer(
    server: McpServer,
    toolName: string,
    description: string,
    inputSchema: any,
    handler: (args: any) => Promise<any>,
  ) {
    // Convert JSON Schema to Zod if needed
    const zodSchema =
      inputSchema &&
      typeof inputSchema === 'object' &&
      inputSchema.type === 'object' &&
      inputSchema.properties
        ? jsonSchemaToZod(inputSchema)
        : inputSchema;

    server.registerTool(
      toolName,
      {
        description,
        inputSchema: zodSchema,
      },
      async (args: any) => {
        const result = await handler(args);

        // If error, throw it
        if (result.isError) {
          const errorText =
            result.content
              ?.map((item: any) => {
                if (item?.type === 'json' && item.json !== undefined) {
                  return JSON.stringify(item.json);
                }
                return item?.text || String(item);
              })
              .join('\n') || 'Unknown error';
          throw new McpError(ErrorCode.InternalError, errorText);
        }

        // Convert content to MCP format - JSON items become text
        const content = (result.content || []).map((item: any) => {
          if (item?.type === 'json' && item.json !== undefined) {
            return {
              type: 'text' as const,
              text: JSON.stringify(item.json),
            };
          }
          return {
            type: 'text' as const,
            text: item?.text || String(item || ''),
          };
        });

        return { content };
      },
    );
  }

  /**
   * Registers all tools on a McpServer instance
   * Used for both main server and per-session servers
   */
  public RegisterAllToolsOnServer(
    server: McpServer,
    context: HandlerContext,
    exposition: string[] = ['readonly', 'high'],
  ) {
    const includeReadOnly = exposition.includes('readonly');
    const includeHigh = exposition.includes('high');
    const includeLow = exposition.includes('low');
    const includeSystem = exposition.includes('system') || true;
    const includeSearch = true;

    // Use HandlerExporter to get all standard tools
    const exporter = new HandlerExporter({
      includeReadOnly,
      includeHighLevel: includeHigh,
      includeLowLevel: includeLow,
      includeSystem,
      includeSearch,
    });

    const standardHandlers = exporter.getHandlerEntries();

    // Register standard handlers
    for (const entry of standardHandlers) {
      this.registerToolOnServer(
        server,
        entry.toolDefinition.name,
        entry.toolDefinition.description,
        entry.toolDefinition.inputSchema,
        (args: any) => entry.handler(context, args),
      );
    }
  }
}
