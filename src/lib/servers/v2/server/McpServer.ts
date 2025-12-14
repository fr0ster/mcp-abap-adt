/**
 * McpServer v2 implementation
 *
 * Main server class with Dependency Injection
 * Orchestrates transport, session management, connection providers, and handlers
 */

import { McpServer as SdkMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { ISessionManager } from '../interfaces/session.js';
import { IConnectionProvider } from '../interfaces/connection.js';
import { IProtocolHandler } from '../interfaces/protocol.js';
import { IHandlersRegistry } from '../../handlers/interfaces.js';
import { sessionContext } from '../../../utils.js';
import { SapConfig } from '@mcp-abap-adt/connection';
import { IClientInfo, SessionInitializationCallback } from '../types/transport.js';

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
 * Extended transport interface with our architecture-specific methods
 */
interface ExtendedTransport extends Transport {
  connectSdkServer?(
    sdkServer: any,
    initializeSession: SessionInitializationCallback,
    defaultDestination?: string
  ): Promise<void>;
  type?: 'stdio' | 'sse' | 'http';
  bindAddress?: string;
  port?: number;
  on?(event: 'session:created', handler: (sessionId: string, clientInfo: IClientInfo) => void): void;
  on?(event: 'session:closed', handler: (sessionId: string) => void): void;
  on?(event: 'message', handler: (sessionId: string, message: JSONRPCMessage) => void): void;
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
    private transport: ExtendedTransport,
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
    // Transport implementation decides how to connect and when to initialize sessions
    await this.transport.connectSdkServer(
      this.mcpServer,
      async (sessionId: string, clientInfo, destination?: string) => {
        // Create session
        const session = this.sessionManager.createSession(clientInfo);

        // Get connection parameters
        const connectionParams = await this.connectionProvider.getConnectionParams({
          sessionId: session.clientSessionId,
          destination: destination || this.defaultDestination,
          headers: clientInfo.headers,
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

        // Set session context (used by handlers via sessionContext.getStore())
        sessionContext.enterWith({
          sessionId: session.clientSessionId,
          sapConfig,
          destination: destination || this.defaultDestination,
        });

        // Also set overrideConfig in lib/utils for backward compatibility
        // This allows handlers to get connection params via getManagedConnection()
        const { setConfigOverride } = require('../../../utils.js');
        setConfigOverride(sapConfig);
      },
      this.defaultDestination
      );
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
    const bindAddress = this.transport.bindAddress;
    if (!bindAddress) {
      return; // Cannot validate without bindAddress
    }
    const isLocalTransport = bindAddress === '127.0.0.1' || bindAddress === 'localhost';
    const isRemoteTransport = bindAddress === '0.0.0.0';

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

          // Send response back through transport (use SDK send() directly)
          await this.transport.send(response);
        } catch (error) {
          this.logger?.error(`Error processing message for session ${sessionId}:`, error);

          // Send error response
          const errorResponse: JSONRPCMessage = {
            jsonrpc: '2.0' as const,
            id: message.id,
            error: {
              code: -32603,
              message: 'Internal error',
              data: error instanceof Error ? error.message : String(error),
            },
          };

          await this.transport.send(errorResponse);
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
  getTransport(): Transport {
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
