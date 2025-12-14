/**
 * McpServer v2 implementation
 *
 * Main server class with Dependency Injection
 * Orchestrates transport, session management, connection providers, and handlers
 */

import { McpServer as SdkMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ITransport } from '../interfaces/transport.js';
import { ISessionManager } from '../interfaces/session.js';
import { IConnectionProvider } from '../interfaces/connection.js';
import { IProtocolHandler } from '../interfaces/protocol.js';
import { IHandlersRegistry } from '../../handlers/interfaces.js';
import { sessionContext } from '../../../utils.js';
import { SapConfig } from '@mcp-abap-adt/connection';

/**
 * Logger interface (optional dependency)
 */
export interface ILogger {
  info(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

/**
 * McpServer - main server orchestrator with Dependency Injection
 *
 * Coordinates all components: transport, sessions, connections, and handlers
 */
export class McpServer {
  private isStarted = false;
  private defaultDestination?: string;

  constructor(
    private transport: ITransport,
    private sessionManager: ISessionManager,
    private connectionProvider: IConnectionProvider,
    private protocolHandler: IProtocolHandler,
    private handlersRegistry: IHandlersRegistry,
    private mcpServer: SdkMcpServer,
    private logger?: ILogger,
    defaultDestination?: string
  ) {
    this.defaultDestination = defaultDestination;
    // Initialize protocol handler with registry and session manager
    this.protocolHandler.initialize(this.handlersRegistry, this.mcpServer, this.sessionManager);

    // Setup transport event handlers
    this.setupTransportHandlers();

    // Setup session manager event handlers
    this.setupSessionHandlers();
  }

  /**
   * Starts the server
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      throw new Error('Server is already started');
    }

    this.logger?.info('Starting MCP Server v2...');

    // Start transport
    await this.transport.start();

    // Connect SDK server to transport
    // SDK server needs direct access to SDK transport instances
    if (this.transport.type === 'stdio') {
      const stdioTransport = this.transport as any;
      const sdkTransport = stdioTransport.getSdkTransport?.();
      if (sdkTransport) {
        // For stdio, SDK transport handles all message processing automatically
        // We just need to connect and set up session/connection params
        await this.mcpServer.server.connect(sdkTransport);
        this.logger?.debug('SDK server connected to stdio transport');

        // Create stdio session and get connection params immediately
        // Stdio has a single global session
        const stdioSessionId = 'stdio-session';
        const clientInfo = { transport: 'stdio' as const };
        const session = this.sessionManager.createSession(clientInfo);

        // Get connection parameters for stdio session
        try {
          const destination = this.defaultDestination;
          if (!destination && this.connectionProvider.mode === 'LOCAL') {
            throw new Error('Destination required for LOCAL mode. Provide --mcp=destination argument.');
          }

          const connectionParams = await this.connectionProvider.getConnectionParams({
            sessionId: session.clientSessionId,
            destination: destination as string | undefined,
            headers: undefined, // No headers for stdio
          });

          // Update session with connection parameters
          if ('updateConnectionParams' in this.sessionManager && typeof this.sessionManager.updateConnectionParams === 'function') {
            (this.sessionManager as any).updateConnectionParams(session.clientSessionId, connectionParams);
          }

          // Set session context for handlers to access connection params
          // Convert IConnectionParams to SapConfig for sessionContext
          const sapConfig: SapConfig = {
            url: connectionParams.sapUrl,
            authType: connectionParams.auth.type,
            ...(connectionParams.auth.type === 'jwt' && connectionParams.auth.jwtToken
              ? { jwtToken: connectionParams.auth.jwtToken }
              : connectionParams.auth.type === 'basic' && connectionParams.auth.username && connectionParams.auth.password
              ? { username: connectionParams.auth.username, password: connectionParams.auth.password }
              : {}),
            ...(connectionParams.client ? { client: connectionParams.client } : {}),
          };

          // Set session context globally for stdio (since SDK transport handles messages directly)
          // This will be used by handlers via sessionContext.getStore()
          sessionContext.enterWith({
            sessionId: session.clientSessionId,
            sapConfig,
            destination: destination,
          });

          // Also set overrideConfig in lib/utils for backward compatibility
          // This allows handlers to get connection params via getManagedConnection()
          const { setConfigOverride } = require('../../../utils.js');
          setConfigOverride(sapConfig);

          this.logger?.debug('Connection params and session context set for stdio session');
        } catch (error) {
          this.logger?.error(`Failed to get connection params for stdio session:`, error);
          // Don't throw - let SDK handle it
        }
      } else {
        throw new Error('Failed to get SDK transport from StdioTransport');
      }
    } else if (this.transport.type === 'sse') {
      // For SSE, transport is handled per-connection
      // Connection will be established when client connects
      // See SseTransport for connection handling
    } else if (this.transport.type === 'http') {
      // For HTTP, transport is handled per-request
      // Connection will be established per request
      // See StreamableHttpTransport for request handling
    }

    this.isStarted = true;
    this.logger?.info('MCP Server v2 started successfully');
  }

  /**
   * Stops the server
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.logger?.info('Stopping MCP Server v2...');

    // Stop transport
    await this.transport.stop();

    // Clear all sessions
    // Note: SessionManager.clearAll() will be called if available
    if ('clearAll' in this.sessionManager && typeof this.sessionManager.clearAll === 'function') {
      (this.sessionManager as any).clearAll();
    }

    this.isStarted = false;
    this.logger?.info('MCP Server v2 stopped');
  }

  /**
   * Validates configuration consistency
   * Ensures transport bind address matches connection provider mode
   */
  validateConfiguration(): void {
    const isLocalTransport = this.transport.bindAddress === '127.0.0.1' || this.transport.bindAddress === 'localhost';
    const isRemoteTransport = this.transport.bindAddress === '0.0.0.0';

    if (isLocalTransport && this.connectionProvider.mode !== 'LOCAL') {
      throw new Error(
        `Configuration mismatch: Transport bind address ${this.transport.bindAddress} (LOCAL) ` +
          `does not match ConnectionProvider mode ${this.connectionProvider.mode}`
      );
    }

    if (isRemoteTransport && this.connectionProvider.mode !== 'REMOTE') {
      throw new Error(
        `Configuration mismatch: Transport bind address ${this.transport.bindAddress} (REMOTE) ` +
          `does not match ConnectionProvider mode ${this.connectionProvider.mode}`
      );
    }
  }

  /**
   * Sets up transport event handlers
   */
  private setupTransportHandlers(): void {
    // Handle new session creation
    // Note: For stdio, session is created in start() method
    // This handler is only for SSE/HTTP transports
    if (this.transport.type !== 'stdio') {
      this.transport.on('session:created', async (sessionId: string, clientInfo) => {
      this.logger?.debug(`Session created: ${sessionId}`, clientInfo);

      // Create session in session manager
      const session = this.sessionManager.createSession(clientInfo);

      // Get connection parameters from connection provider
      try {
        // For LOCAL mode, destination must be provided (from --mcp argument)
        // For REMOTE mode, destination comes from headers
        const destination = this.defaultDestination || clientInfo.headers?.['x-mcp-destination'];

        if (!destination && this.connectionProvider.mode === 'LOCAL') {
          throw new Error('Destination required for LOCAL mode. Provide --mcp=destination argument or x-mcp-destination header.');
        }

        const connectionParams = await this.connectionProvider.getConnectionParams({
          sessionId: session.clientSessionId,
          destination: destination as string | undefined,
          headers: clientInfo.headers,
        });

        // Update session with connection parameters
        if ('updateConnectionParams' in this.sessionManager && typeof this.sessionManager.updateConnectionParams === 'function') {
          (this.sessionManager as any).updateConnectionParams(session.clientSessionId, connectionParams);
        }
      } catch (error) {
        this.logger?.error(`Failed to get connection params for session ${sessionId}:`, error);
      }
      });
    }

    // Handle session closure
    // Note: For stdio, session closure is handled by SDK transport
    if (this.transport.type !== 'stdio') {
      this.transport.on('session:closed', (sessionId: string) => {
        this.logger?.debug(`Session closed: ${sessionId}`);
        this.sessionManager.deleteSession(sessionId);
      });
    }

    // Handle incoming messages
    // Note: For stdio, SDK transport handles messages automatically
    // This handler is only for SSE/HTTP transports
    if (this.transport.type !== 'stdio') {
      this.transport.on('message', async (sessionId: string, message: any) => {
        this.logger?.debug(`Message received for session ${sessionId}:`, message);

        try {
          // Get session
          const session = this.sessionManager.getSession(sessionId);
          if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
          }

          // Handle request through protocol handler
          const response = await this.protocolHandler.handleRequest(sessionId, message);

          // Send response back through transport
          await this.transport.send(sessionId, response);
        } catch (error) {
          this.logger?.error(`Error processing message for session ${sessionId}:`, error);

          // Send error response
          const errorResponse = {
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32603,
              message: 'Internal error',
              data: error instanceof Error ? error.message : String(error),
            },
          };

          await this.transport.send(sessionId, errorResponse);
        }
      });
    }
  }

  /**
   * Sets up session manager event handlers
   */
  private setupSessionHandlers(): void {
    this.sessionManager.on('created', (session) => {
      this.logger?.debug(`Session created in manager: ${session.clientSessionId}`);
    });

    this.sessionManager.on('closed', (session) => {
      this.logger?.debug(`Session closed in manager: ${session.clientSessionId}`);
    });

    this.sessionManager.on('abapSessionSet', (session) => {
      this.logger?.debug(`ABAP session set for: ${session.clientSessionId}`);
    });
  }

  /**
   * Gets the SDK MCP server instance (for direct access if needed)
   */
  getSdkServer(): SdkMcpServer {
    return this.mcpServer;
  }

  /**
   * Gets the transport instance (for direct access if needed)
   */
  getTransport(): ITransport {
    return this.transport;
  }

  /**
   * Gets the session manager instance (for direct access if needed)
   */
  getSessionManager(): ISessionManager {
    return this.sessionManager;
  }

  /**
   * Gets the connection provider instance (for direct access if needed)
   */
  getConnectionProvider(): IConnectionProvider {
    return this.connectionProvider;
  }
}
