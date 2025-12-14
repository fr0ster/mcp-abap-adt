/**
 * StreamableHttpTransport implementation
 *
 * Wraps StreamableHTTPServerTransport from MCP SDK for HTTP POST communication
 * Mode depends on bind address: '127.0.0.1' = LOCAL, '0.0.0.0' = REMOTE
 *
 * Note: StreamableHTTPServerTransport doesn't create HTTP server itself.
 * It handles requests via handleRequest(req, res) method.
 * HTTP server needs to be created separately and integrated in Phase 2.
 */

import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ITransport, IClientInfo, McpMessage } from '../interfaces/transport.js';

export interface StreamableHttpTransportOptions {
  port: number;
  host: string; // '127.0.0.1' for LOCAL, '0.0.0.0' for REMOTE
  sessionIdGenerator?: () => string; // Optional: defaults to randomUUID
  enableJsonResponse?: boolean; // If true, returns JSON instead of SSE stream
}

/**
 * StreamableHttpTransport - HTTP POST transport with streaming responses
 *
 * Supports multiple sessions via HTTP POST requests
 * HTTP server integration will be completed in Phase 2
 */
export class StreamableHttpTransport implements ITransport {
  readonly type = 'http' as const;
  readonly bindAddress: string;
  readonly port: number;

  private sdkTransport: StreamableHTTPServerTransport;
  private httpServer?: any; // HTTP server will be created in start()
  private eventHandlers: {
    'session:created': Array<(sessionId: string, clientInfo: IClientInfo) => void>;
    'session:closed': Array<(sessionId: string) => void>;
    'message': Array<(sessionId: string, message: McpMessage) => void>;
  } = {
    'session:created': [],
    'session:closed': [],
    'message': [],
  };

  constructor(options: StreamableHttpTransportOptions) {
    this.port = options.port;
    this.bindAddress = options.host;

    this.sdkTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: options.sessionIdGenerator || (() => randomUUID()),
      enableJsonResponse: options.enableJsonResponse,
      onsessioninitialized: (sessionId: string) => {
        // Emit session:created event
        const clientInfo: IClientInfo = {
          transport: 'http',
          ip: undefined, // Will be extracted from request
        };
        this.emit('session:created', sessionId, clientInfo);
      },
      onsessionclosed: (sessionId: string) => {
        this.emit('session:closed', sessionId);
      },
    });
  }

  async start(): Promise<void> {
    await this.sdkTransport.start();
    // TODO: Create HTTP server and integrate with handleRequest
    // This will be implemented in Phase 2
  }

  async stop(): Promise<void> {
    await this.sdkTransport.close();
    if (this.httpServer) {
      // Close HTTP server
    }
  }

  on(event: 'session:created', handler: (sessionId: string, clientInfo: IClientInfo) => void): void;
  on(event: 'session:closed', handler: (sessionId: string) => void): void;
  on(event: 'message', handler: (sessionId: string, message: McpMessage) => void): void;
  on(event: string, handler: (...args: any[]) => void): void {
    if (event === 'session:created' || event === 'session:closed' || event === 'message') {
      this.eventHandlers[event].push(handler as any);
    }
  }

  async send(sessionId: string, message: McpMessage): Promise<void> {
    await this.sdkTransport.send(message as any);
  }

  /**
   * Handles HTTP request - to be called from HTTP server
   * @param req - Incoming HTTP request
   * @param res - Server response
   * @param parsedBody - Optional pre-parsed request body
   */
  async handleRequest(req: any, res: any, parsedBody?: unknown): Promise<void> {
    await this.sdkTransport.handleRequest(req, res, parsedBody);
  }

  /**
   * Gets the SDK transport instance (for direct access if needed)
   */
  getSdkTransport(): StreamableHTTPServerTransport {
    return this.sdkTransport;
  }

  private emit(event: 'session:created', sessionId: string, clientInfo: IClientInfo): void;
  private emit(event: 'session:closed', sessionId: string): void;
  private emit(event: 'message', sessionId: string, message: McpMessage): void;
  private emit(event: string, ...args: any[]): void {
    if (event === 'session:created') {
      const [sessionId, clientInfo] = args as [string, IClientInfo];
      this.eventHandlers['session:created'].forEach((handler) => {
        handler(sessionId, clientInfo);
      });
    } else if (event === 'session:closed') {
      const [sessionId] = args as [string];
      this.eventHandlers['session:closed'].forEach((handler) => {
        handler(sessionId);
      });
    } else if (event === 'message') {
      const [sessionId, message] = args as [string, McpMessage];
      this.eventHandlers['message'].forEach((handler) => {
        handler(sessionId, message);
      });
    }
  }
}
