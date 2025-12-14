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
import http from 'http';
import { StreamableHTTPServerTransport, StreamableHTTPServerTransportOptions } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { IClientInfo, SessionInitializationCallback } from '../types/transport.js';

export interface StreamableHttpTransportOptions {
  port: number;
  host: string; // '127.0.0.1' for LOCAL, '0.0.0.0' for REMOTE
  sessionIdGenerator?: () => string; // Optional: defaults to randomUUID
  enableJsonResponse?: boolean; // If true, returns JSON instead of SSE stream
}

/**
 * StreamableHttpTransport - HTTP POST transport with streaming responses
 *
 * Extends StreamableHTTPServerTransport from MCP SDK
 * Supports multiple sessions via HTTP POST requests
 */
export class StreamableHttpTransport extends StreamableHTTPServerTransport {
  readonly type = 'http' as const;
  readonly bindAddress: string;
  readonly port: number;

  private httpServer?: http.Server;
  private initializeSession?: SessionInitializationCallback;
  private defaultDestination?: string;
  private eventHandlers: {
    'session:created': Array<(sessionId: string, clientInfo: IClientInfo) => void>;
    'session:closed': Array<(sessionId: string) => void>;
    'message': Array<(sessionId: string, message: JSONRPCMessage) => void>;
  } = {
    'session:created': [],
    'session:closed': [],
    'message': [],
  };

  constructor(options: StreamableHttpTransportOptions) {
    // Call SDK transport constructor with options
    const sdkOptions: StreamableHTTPServerTransportOptions = {
      sessionIdGenerator: options.sessionIdGenerator || (() => randomUUID()),
      enableJsonResponse: options.enableJsonResponse,
      onsessioninitialized: async (sessionId: string) => {
        // Initialize session when SDK transport creates it
        if (this.initializeSession) {
          const clientInfo: IClientInfo = {
            transport: 'http',
            ip: undefined, // Will be extracted from request in Phase 2
            headers: undefined, // Will be extracted from request in Phase 2
          };
          try {
            await this.initializeSession(sessionId, clientInfo, this.defaultDestination);
          } catch (error) {
            // Log error but don't throw - let SDK handle it
            console.error(`Failed to initialize session ${sessionId}:`, error);
          }
        }

        // Emit session:created event
        const clientInfo: IClientInfo = {
          transport: 'http',
          ip: undefined, // Will be extracted from request in Phase 2
        };
        this.emit('session:created', sessionId, clientInfo);
      },
      onsessionclosed: (sessionId: string) => {
        this.emit('session:closed', sessionId);
      },
    };
    super(sdkOptions);

    this.port = options.port;
    this.bindAddress = options.host;
  }

  async start(): Promise<void> {
    await super.start(); // Call SDK transport start()

    // Create HTTP server and set up request handler
    this.httpServer = http.createServer();
    this.httpServer.on('request', async (req, res) => {
      await this.handleRequest(req, res);
    });

    // Start listening on configured port and host
    return new Promise((resolve, reject) => {
      this.httpServer!.listen(this.port, this.bindAddress, () => {
        resolve();
      });
      this.httpServer!.on('error', reject);
    });
  }


  async connectSdkServer(
    sdkServer: any,
    initializeSession: SessionInitializationCallback,
    defaultDestination?: string
  ): Promise<void> {
    // Store callback and destination for session initialization
    this.initializeSession = initializeSession;
    this.defaultDestination = defaultDestination;

    // HTTP transport handles sessions per-request via handleRequest
    // SDK server connection is handled internally by StreamableHTTPServerTransport
    // Session initialization will be triggered by onsessioninitialized callback
    // which was set up in constructor
  }

  async close(): Promise<void> {
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
    }
    await super.close(); // Call SDK transport close()
  }

  // Additional methods for our architecture (not in SDK Transport)
  on(event: 'session:created', handler: (sessionId: string, clientInfo: IClientInfo) => void): void;
  on(event: 'session:closed', handler: (sessionId: string) => void): void;
  on(event: 'message', handler: (sessionId: string, message: JSONRPCMessage) => void): void;
  on(event: string, handler: (...args: any[]) => void): void {
    if (event === 'session:created' || event === 'session:closed' || event === 'message') {
      this.eventHandlers[event].push(handler as any);
    }
  }

  // Additional method for our architecture (wraps SDK send with sessionId)
  async sendMessage(sessionId: string, message: JSONRPCMessage): Promise<void> {
    // Use SDK send() directly - sessionId is handled by SDK transport
    await this.send(message);
  }

  /**
   * Handles HTTP request - to be called from HTTP server
   * @param req - Incoming HTTP request
   * @param res - Server response
   * @param parsedBody - Optional pre-parsed request body
   */
  async handleRequest(req: any, res: any, parsedBody?: unknown): Promise<void> {
    // Call SDK transport handleRequest (we are the SDK transport)
    await super.handleRequest(req, res, parsedBody);
  }

  private emit(event: 'session:created', sessionId: string, clientInfo: IClientInfo): void;
  private emit(event: 'session:closed', sessionId: string): void;
  private emit(event: 'message', sessionId: string, message: JSONRPCMessage): void;
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
      const [sessionId, message] = args as [string, JSONRPCMessage];
      this.eventHandlers['message'].forEach((handler) => {
        handler(sessionId, message);
      });
    }
  }
}
