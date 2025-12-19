import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AbapConnection, createAbapConnection } from "@mcp-abap-adt/connection";
import { AuthBroker } from "@mcp-abap-adt/auth-broker";
import { ConnectionContext } from "./ConnectionContext.js";
import { IHandlersRegistry } from "../../lib/handlers/interfaces.js";
import { CompositeHandlersRegistry } from "../../lib/handlers/registry/CompositeHandlersRegistry.js";
import { HandlerContext } from "../../handlers/interfaces.js";
import { defaultLogger, type Logger } from "@mcp-abap-adt/logger";
import { registerAuthBroker } from "../../lib/utils.js";

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

  constructor(options: { name: string; version?: string; logger?: Logger }) {
    super({ name: options.name, version: options.version ?? "1.0.0" });
    this.logger = options.logger ?? defaultLogger;
  }

  /**
   * Sets connection context using auth broker
   * For stdio: called once on startup
   * For SSE/HTTP: called per-request
   */
  protected async setConnectionContext(
    destination: string,
    authBroker: AuthBroker
  ): Promise<void> {
    this.authBroker = authBroker;
    // Register broker so destination-aware connections can refresh tokens
    registerAuthBroker(destination, authBroker);

    // Get connection parameters from broker
    // AuthBroker.getConnectionConfig() automatically checks session store first, then service key store
    const connectionConfig = await authBroker.getConnectionConfig(destination);

    if (!connectionConfig) {
      throw new Error(`Connection config not found for destination: ${destination}`);
    }

    // Try to get fresh token from broker
    // If broker can't refresh (no UAA credentials), use existing token from connectionConfig
    let freshToken: string | undefined;
    try {
      freshToken = await authBroker.getToken(destination);
    } catch (error) {
      // Broker can't provide/refresh token (e.g., no UAA credentials for .env-only setup)
      // Use existing token from connectionConfig - user is responsible for token management
      this.logger.debug(`Broker can't refresh token, using existing token from session: ${error instanceof Error ? error.message : String(error)}`);
      freshToken = connectionConfig.authorizationToken;
    }
    const tokenToUse = freshToken || connectionConfig.authorizationToken || '';

    // Determine auth type from connection config
    const authType = connectionConfig.authType ||
                     (connectionConfig.username && connectionConfig.password ? 'basic' : 'jwt');

    this.connectionContext = {
      sessionId: destination,
      connectionParams: authType === 'basic'
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
   * Gets current connection context
   */
  protected getConnectionContext(): ConnectionContext | null {
    return this.connectionContext;
  }

  /**
   * Gets ABAP connection from connection context
   * Creates connection using connectionParams from context
   * Automatically refreshes token via AuthBroker if available (inside makeAdtRequest)
   */
  protected async getConnection(): Promise<AbapConnection> {
    if (!this.connectionContext?.connectionParams) {
      throw new Error('Connection context not set. Call setConnectionContext() first.');
    }

    const connection = createAbapConnection(this.connectionContext.connectionParams);
    const destination = this.connectionContext.metadata?.destination as string | undefined;
    if (destination) {
      const { createDestinationAwareConnection } = await import('../../lib/utils.js');
      return createDestinationAwareConnection(connection, destination);
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
          const wrappedHandler = async (args: any) => {
            // Get connection from context (this.connectionContext)
            // Token will be automatically refreshed via AuthBroker if needed
            const context: HandlerContext = {
              connection: await this.getConnection(),
              logger: this.logger,
            };

            // If handler expects context+args (preferred), pass both.
            // Otherwise, update group context and call with args only for backward compatibility.
            // NOTE: Always await the handler result to ensure we get the resolved value for normalization
            let handlerPromise: Promise<any>;
            if ((entry.handler as any).length >= 2) {
              handlerPromise = (entry.handler as any)(context, args);
            } else {
              try {
                if (typeof (group as any).setContext === 'function') {
                  (group as any).setContext(context);
                } else {
                  (group as any).context = context;
                }
              } catch {
                // ignore if group doesn't expose context setter
              }
              handlerPromise = (entry.handler as any)(args);
            }

            const result = await handlerPromise;

            // Handle errors: if handler returns isError, throw McpError
            if (result?.isError) {
              const { ErrorCode, McpError } = await import('@modelcontextprotocol/sdk/types.js');
              const errorText = (result.content || [])
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
              // Ensure all items have proper text type structure
              return {
                type: 'text' as const,
                text: item?.text || String(item || ''),
              };
            });

            return { content };
          };

          // Register wrapped handler via SDK registerTool
          // Note: connection is NOT part of MCP tool signature
          this.registerTool(
            entry.toolDefinition.name,
            {
              description: entry.toolDefinition.description,
              inputSchema: entry.toolDefinition.inputSchema,
            },
            wrappedHandler
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
