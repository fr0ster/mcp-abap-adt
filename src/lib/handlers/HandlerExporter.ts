import type { AbapConnection } from '@mcp-abap-adt/connection';
import type { Logger } from '@mcp-abap-adt/logger';
import { defaultLogger } from '@mcp-abap-adt/logger';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HandlerContext } from '../../handlers/interfaces.js';
import { HighLevelHandlersGroup } from './groups/HighLevelHandlersGroup.js';
import { LowLevelHandlersGroup } from './groups/LowLevelHandlersGroup.js';
import { ReadOnlyHandlersGroup } from './groups/ReadOnlyHandlersGroup.js';
import { SearchHandlersGroup } from './groups/SearchHandlersGroup.js';
import { SystemHandlersGroup } from './groups/SystemHandlersGroup.js';
import type {
  HandlerEntry,
  IHandlerGroup,
  IHandlersRegistry,
} from './interfaces.js';
import { CompositeHandlersRegistry } from './registry/CompositeHandlersRegistry.js';

/**
 * Options for creating handler exporter
 */
export interface HandlerExporterOptions {
  /**
   * Logger instance for handler context
   * @default defaultLogger
   */
  logger?: Logger;

  /**
   * Include readonly handlers (getProgram, getClass, etc.)
   * @default true
   */
  includeReadOnly?: boolean;

  /**
   * Include high-level handlers
   * @default true
   */
  includeHighLevel?: boolean;

  /**
   * Include low-level handlers
   * @default true
   */
  includeLowLevel?: boolean;

  /**
   * Include system handlers
   * @default true
   */
  includeSystem?: boolean;

  /**
   * Include search handlers
   * @default true
   */
  includeSearch?: boolean;
}

/**
 * Handler Exporter - exports MCP handlers for use in external servers
 *
 * This class provides a simple way to register ABAP ADT handlers on any McpServer instance.
 * It's designed for integration with external servers (like cloud-llm-hub) that manage
 * their own connection lifecycle.
 *
 * Usage:
 * ```typescript
 * import { HandlerExporter } from '@fr0ster/mcp-abap-adt';
 *
 * // Create exporter
 * const exporter = new HandlerExporter();
 *
 * // Register on your McpServer with connection provider
 * exporter.registerOnServer(mcpServer, () => getConnection());
 * ```
 */
export class HandlerExporter {
  private readonly logger: Logger;
  private readonly handlerGroups: IHandlerGroup[];

  constructor(options?: HandlerExporterOptions) {
    this.logger = options?.logger ?? defaultLogger;

    // Create dummy context for group instantiation
    // Real context will be provided per-request via registerOnServer
    const dummyContext: HandlerContext = {
      connection: null as any,
      logger: this.logger,
    };

    // Build handler groups based on options
    this.handlerGroups = [];

    if (options?.includeReadOnly !== false) {
      this.handlerGroups.push(new ReadOnlyHandlersGroup(dummyContext));
    }
    if (options?.includeHighLevel !== false) {
      this.handlerGroups.push(new HighLevelHandlersGroup(dummyContext));
    }
    if (options?.includeLowLevel !== false) {
      this.handlerGroups.push(new LowLevelHandlersGroup(dummyContext));
    }
    if (options?.includeSystem !== false) {
      this.handlerGroups.push(new SystemHandlersGroup(dummyContext));
    }
    if (options?.includeSearch !== false) {
      this.handlerGroups.push(new SearchHandlersGroup(dummyContext));
    }
  }

  /**
   * Get all handler entries
   * Useful for inspection or custom registration logic
   */
  getHandlerEntries(): HandlerEntry[] {
    const entries: HandlerEntry[] = [];
    for (const group of this.handlerGroups) {
      entries.push(...group.getHandlers());
    }
    return entries;
  }

  /**
   * Get list of tool names
   */
  getToolNames(): string[] {
    return this.getHandlerEntries().map((e) => e.toolDefinition.name);
  }

  /**
   * Create handlers registry for use with v2 servers
   */
  createRegistry(): IHandlersRegistry {
    return new CompositeHandlersRegistry(this.handlerGroups);
  }

  /**
   * Register all handlers on an McpServer instance
   *
   * @param server - McpServer instance to register handlers on
   * @param connectionProvider - Function that returns AbapConnection for each request
   * @param logger - Optional logger (defaults to constructor logger)
   *
   * The connectionProvider is called for each handler invocation, allowing
   * per-request connection management (e.g., different JWT tokens per request)
   */
  registerOnServer(
    server: McpServer,
    connectionProvider: () => AbapConnection | Promise<AbapConnection>,
    logger?: Logger,
  ): void {
    const log = logger ?? this.logger;

    for (const group of this.handlerGroups) {
      const handlers = group.getHandlers();

      for (const entry of handlers) {
        // Wrap handler to inject connection from provider
        const wrappedHandler = async (args: any) => {
          const connection = await connectionProvider();
          const context: HandlerContext = {
            connection,
            logger: log,
          };

          const result = await entry.handler(context, args);

          // Handle errors: if handler returns isError, throw McpError
          if (result?.isError) {
            const { ErrorCode, McpError } = await import(
              '@modelcontextprotocol/sdk/types.js'
            );
            const errorText =
              (result.content || [])
                .map((item: any) => {
                  if (item?.type === 'json' && item.json !== undefined) {
                    return JSON.stringify(item.json);
                  }
                  return item?.text || String(item);
                })
                .join('\n') || 'Unknown error';
            throw new McpError(ErrorCode.InternalError, errorText);
          }

          // Normalize content: SDK expects text/image/audio/resource, convert custom json to text
          const content = (result?.content || []).map((item: any) => {
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
        };

        // Register tool on server
        server.registerTool(
          entry.toolDefinition.name,
          {
            description: entry.toolDefinition.description,
            inputSchema: entry.toolDefinition.inputSchema,
          },
          wrappedHandler,
        );
      }
    }

    log.info?.(
      `[HandlerExporter] Registered ${this.getToolNames().length} tools on server`,
    );
  }
}

/**
 * Create default handler exporter with all handler groups
 */
export function createDefaultHandlerExporter(logger?: Logger): HandlerExporter {
  return new HandlerExporter({ logger });
}
