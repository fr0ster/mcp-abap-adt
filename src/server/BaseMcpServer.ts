import { createRequire } from 'node:module';
import type { AuthBroker } from '@mcp-abap-adt/auth-broker';
import {
  type AbapConnection,
  createAbapConnection,
} from '@mcp-abap-adt/connection';
import type { Logger } from '@mcp-abap-adt/logger';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HandlerContext } from '../handlers/interfaces.js';
import type { IHandlersRegistry } from '../lib/handlers/interfaces.js';
import { CompositeHandlersRegistry } from '../lib/handlers/registry/CompositeHandlersRegistry.js';
import { jsonSchemaToZod } from '../lib/handlers/utils/schemaUtils.js';
import { registerAuthBroker } from '../lib/utils.js';
import type { ConnectionContext } from './ConnectionContext.js';

/**
 * Base MCP Server class that extends SDK McpServer
 * Manages connection context and provides connection injection for handlers
 */
export abstract class BaseMcpServer extends McpServer {
  /**
   * Logger used for handler context
   */
  protected readonly logger: Logger;

  /**
   * Connection context (set per request for SSE/HTTP, once for stdio)
   */
  protected connectionContext: ConnectionContext | null = null;

  /**
   * Auth broker for token and service key management
   */
  protected authBroker?: AuthBroker;

  /**
   * Cached connection for stdio mode (created once, reused for all requests)
   */
  private cachedConnection: AbapConnection | null = null;

  constructor(options: { name: string; version?: string; logger?: Logger }) {
    super({ name: options.name, version: options.version ?? '1.0.0' });
    this.logger = options.logger ?? getDefaultLogger();
  }

  /**
   * Sets connection context using auth broker
   * For stdio: called once on startup
   * For SSE/HTTP: called per-request
   */
  protected async setConnectionContext(
    destination: string,
    authBroker: AuthBroker,
  ): Promise<void> {
    this.authBroker = authBroker;
    // Register broker so destination-aware connections can refresh tokens
    registerAuthBroker(destination, authBroker);

    this.logger.debug(
      `[BaseMcpServer] Getting connection config for destination: ${destination}`,
    );

    // Get connection parameters from broker
    // AuthBroker.getConnectionConfig() automatically checks session store first, then service key store
    const connectionConfig = await authBroker.getConnectionConfig(destination);

    this.logger.debug(`[BaseMcpServer] Connection config result:`, {
      found: !!connectionConfig,
      destination,
      hasServiceUrl: !!connectionConfig?.serviceUrl,
    });

    if (!connectionConfig) {
      throw new Error(
        `Connection config not found for destination: ${destination}`,
      );
    }

    // Try to get fresh token from broker
    // If broker can't refresh (no UAA credentials), use existing token from connectionConfig
    let freshToken: string | undefined;
    let tokenError: unknown;
    try {
      freshToken = await authBroker.getToken(destination);
    } catch (error) {
      // Broker can't provide/refresh token (e.g., no UAA credentials for .env-only setup)
      // Use existing token from connectionConfig - user is responsible for token management
      this.logger.debug(
        `Broker can't refresh token, using existing token from session: ${error instanceof Error ? error.message : String(error)}`,
      );
      tokenError = error;
      freshToken = connectionConfig.authorizationToken;
    }
    const tokenToUse = freshToken || connectionConfig.authorizationToken || '';

    // Determine auth type from connection config
    const authType =
      connectionConfig.authType ||
      (connectionConfig.username && connectionConfig.password
        ? 'basic'
        : 'jwt');

    if (authType === 'jwt' && !tokenToUse) {
      const reason =
        tokenError instanceof Error ? tokenError.message : String(tokenError);
      throw new Error(
        `JWT token is missing for destination "${destination}". ${reason ? `Token provider error: ${reason}. ` : ''}Provide a valid session token (or refresh token) for this destination, or use --env-path with SAP_JWT_TOKEN.`,
      );
    }

    this.connectionContext = {
      sessionId: destination,
      connectionParams:
        authType === 'basic'
          ? {
              url: connectionConfig.serviceUrl || '',
              authType: 'basic',
              username: connectionConfig.username || '',
              password: connectionConfig.password || '',
              client: connectionConfig.sapClient || '',
            }
          : {
              url: connectionConfig.serviceUrl || '',
              authType: 'jwt',
              jwtToken: tokenToUse, // broker keeps it fresh
              client: connectionConfig.sapClient || '',
            },
      metadata: {
        destination,
      },
    };
  }

  /**
   * Sets connection context from HTTP headers (direct SAP connection, no broker)
   * Used when x-sap-url + auth headers are provided
   */
  protected setConnectionContextFromHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): void {
    const getHeader = (name: string): string | undefined => {
      const value = headers[name] ?? headers[name.toUpperCase()];
      return Array.isArray(value) ? value[0] : value;
    };

    const url = getHeader('x-sap-url');
    const jwtToken = getHeader('x-sap-jwt-token');
    const username = getHeader('x-sap-login');
    const password = getHeader('x-sap-password');
    const client = getHeader('x-sap-client') || '';

    if (!url) {
      throw new Error('x-sap-url header is required for direct SAP connection');
    }

    if (jwtToken) {
      // JWT auth
      this.connectionContext = {
        sessionId: 'direct-jwt',
        connectionParams: {
          url,
          authType: 'jwt',
          jwtToken,
          client,
        },
        metadata: {},
      };
    } else if (username && password) {
      // Basic auth
      this.connectionContext = {
        sessionId: 'direct-basic',
        connectionParams: {
          url,
          authType: 'basic',
          username,
          password,
          client,
        },
        metadata: {},
      };
    } else {
      throw new Error(
        'Either x-sap-jwt-token or x-sap-login+x-sap-password headers are required',
      );
    }
  }

  /**
   * Gets current connection context
   */
  protected getConnectionContext(): ConnectionContext | null {
    return this.connectionContext;
  }

  /**
   * Gets ABAP connection from connection context
   * Creates connection using connectionParams from context
   * Automatically refreshes token via AuthBroker if available (inside makeAdtRequest)
   * For stdio mode: caches connection and reuses it for all requests (like v1)
   * For SSE/HTTP: creates new connection per request
   */
  protected async getConnection(): Promise<AbapConnection> {
    if (!this.connectionContext?.connectionParams) {
      throw new Error(
        'Connection context not set. Call setConnectionContext() first.',
      );
    }

    const destination = this.connectionContext.metadata?.destination as
      | string
      | undefined;
    const sessionId = this.connectionContext.sessionId;

    // For stdio mode: cache connection and reuse it (like v1)
    // This prevents creating new connection on each request, which would trigger browser auth
    // Check if we have cached connection with same sessionId (stdio uses destination as sessionId)
    if (destination && this.cachedConnection && sessionId === destination) {
      // Reuse cached connection for stdio mode
      return this.cachedConnection;
    }

    const connection = createAbapConnection(
      this.connectionContext.connectionParams,
    );

    // Cache connection for stdio mode (when sessionId === destination, it's stdio)
    // SSE/HTTP modes use different sessionId per request, so caching won't interfere
    if (destination && sessionId === destination) {
      this.cachedConnection = connection;
    }

    return connection;
  }

  /**
   * Registers handlers from registry
   * Wraps handlers to inject connection as first parameter
   *
   * Handler signature: (connection: AbapConnection, args: any) => Promise<any>
   * Registered as: (args: any) => handler(getConnection(), args)
   *
   * This ensures connection is injected but NOT exposed in MCP tool signature
   */
  protected registerHandlers(handlersRegistry: IHandlersRegistry): void {
    // Get handler groups from registry
    if (handlersRegistry instanceof CompositeHandlersRegistry) {
      const groups = handlersRegistry.getHandlerGroups();

      for (const group of groups) {
        const handlers = group.getHandlers();
        for (const entry of handlers) {
          // Wrap handler to inject connection from context
          // Original handler: (context: HandlerContext, args: any) => Promise<any>
          type HandlerFnWithContext = (
            context: HandlerContext,
            args: unknown,
          ) => Promise<unknown>;
          type HandlerFnArgsOnly = (args: unknown) => Promise<unknown>;

          const wrappedHandler = async (args: unknown) => {
            // Get connection from context (this.connectionContext)
            // Token will be automatically refreshed via AuthBroker if needed
            const context: HandlerContext = {
              connection: await this.getConnection(),
              logger: this.logger,
            };

            // If handler expects context+args (preferred), pass both.
            // Otherwise, update group context and call with args only for backward compatibility.
            // NOTE: Always await the handler result to ensure we get the resolved value for normalization
            let handlerPromise: Promise<unknown>;
            if ((entry.handler as HandlerFnWithContext).length >= 2) {
              handlerPromise = (entry.handler as HandlerFnWithContext)(
                context,
                args,
              );
            } else {
              try {
                const contextAwareGroup = group as Partial<{
                  setContext: (ctx: HandlerContext) => void;
                  context: HandlerContext;
                }>;
                if (typeof contextAwareGroup.setContext === 'function') {
                  contextAwareGroup.setContext(context);
                } else {
                  contextAwareGroup.context = context;
                }
              } catch {
                // ignore if group doesn't expose context setter
              }
              handlerPromise = (entry.handler as HandlerFnArgsOnly)(args);
            }

            const result = await handlerPromise;

            // Handle errors: if handler returns isError, throw McpError
            type ContentItem = {
              type?: string;
              json?: unknown;
              text?: unknown;
            };
            type ToolResult = {
              isError?: boolean;
              content?: ContentItem[];
            };

            if ((result as ToolResult | undefined)?.isError) {
              const { ErrorCode, McpError } = await import(
                '@modelcontextprotocol/sdk/types.js'
              );
              const errorText =
                ((result as ToolResult | undefined)?.content || [])
                  .map((item) => {
                    if (item?.type === 'json' && item.json !== undefined) {
                      return JSON.stringify(item.json);
                    }
                    return item?.text !== undefined
                      ? String(item.text)
                      : String(item);
                  })
                  .join('\n') || 'Unknown error';
              throw new McpError(ErrorCode.InternalError, errorText);
            }

            // Normalize content: SDK expects text/image/audio/resource, convert custom json to text
            const content = (
              (result as ToolResult | undefined)?.content || []
            ).map((item) => {
              if (item?.type === 'json' && item.json !== undefined) {
                return {
                  type: 'text' as const,
                  text: JSON.stringify(item.json),
                };
              }
              // Ensure all items have proper text type structure
              return {
                type: 'text' as const,
                text:
                  item?.text !== undefined
                    ? String(item.text)
                    : String(item || ''),
              };
            });

            return { content };
          };

          // Convert JSON Schema to Zod if needed, otherwise pass as-is
          const zodSchema =
            entry.toolDefinition.inputSchema &&
            typeof entry.toolDefinition.inputSchema === 'object' &&
            entry.toolDefinition.inputSchema.type === 'object' &&
            entry.toolDefinition.inputSchema.properties
              ? jsonSchemaToZod(entry.toolDefinition.inputSchema)
              : entry.toolDefinition.inputSchema;

          // Register wrapped handler via SDK registerTool
          // Note: connection is NOT part of MCP tool signature
          this.registerTool(
            entry.toolDefinition.name,
            {
              description: entry.toolDefinition.description,
              inputSchema: zodSchema,
            },
            wrappedHandler,
          );
        }
      }
    } else {
      // Fallback: use registerAllTools directly (handlers won't have connection injected)
      // This should not happen in normal flow
      handlersRegistry.registerAllTools(this);
    }
  }
}

function getDefaultLogger(): Logger {
  const require = createRequire(__filename);
  const mod = require('@mcp-abap-adt/logger');
  return mod.defaultLogger ?? new mod.DefaultLogger();
}
