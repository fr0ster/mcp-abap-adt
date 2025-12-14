/**
 * Transport layer interfaces
 *
 * Transport layer determines whether the server will be local (127.0.0.1) or global (0.0.0.0)
 */

/**
 * Client information extracted from transport connection
 */
export interface IClientInfo {
  /** Transport type */
  transport: 'stdio' | 'sse' | 'http';
  /** Client IP address (if available) */
  ip?: string;
  /** HTTP headers (if available) */
  headers?: Record<string, string>;
  /** User agent (if available) */
  userAgent?: string;
}

/**
 * MCP message type (from SDK)
 */
export type McpMessage = any; // TODO: Import proper type from SDK

/**
 * Transport interface
 *
 * Wraps MCP SDK transports (StdioServerTransport, SSEServerTransport, StreamableHTTPServerTransport)
 * to provide unified interface for server implementation
 */
export interface ITransport {
  /** Transport type */
  readonly type: 'stdio' | 'sse' | 'http';

  /** Bind address - determines mode: '127.0.0.1' = LOCAL, '0.0.0.0' = REMOTE */
  readonly bindAddress: string;

  /** Port number (if applicable) */
  readonly port?: number;

  /**
   * Start the transport
   */
  start(): Promise<void>;

  /**
   * Stop the transport
   */
  stop(): Promise<void>;

  /**
   * Register event handler
   * @param event - Event name
   * @param handler - Event handler function
   */
  on(event: 'session:created', handler: (sessionId: string, clientInfo: IClientInfo) => void): void;
  on(event: 'session:closed', handler: (sessionId: string) => void): void;
  on(event: 'message', handler: (sessionId: string, message: McpMessage) => void): void;

  /**
   * Send message to client
   * @param sessionId - Session identifier
   * @param message - MCP message
   */
  send(sessionId: string, message: McpMessage): Promise<void>;
}
