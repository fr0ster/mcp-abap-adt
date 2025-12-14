/**
 * SseTransport implementation
 *
 * Note: SSEServerTransport is deprecated in MCP SDK.
 * Consider using StreamableHttpTransport instead, which supports SSE.
 *
 * This implementation wraps SSEServerTransport for backward compatibility.
 * SSEServerTransport requires endpoint and ServerResponse per request,
 * so this is a placeholder that will need HTTP server integration.
 */

import http from 'http';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { IClientInfo, SessionInitializationCallback } from '../types/transport.js';

export interface SseTransportOptions {
  port: number;
  host: string; // '127.0.0.1' for LOCAL, '0.0.0.0' for REMOTE
  endpoint?: string; // Endpoint path for SSE (default: '/sse')
}

/**
 * SseTransport - Server-Sent Events transport (deprecated)
 *
 * Note: SSEServerTransport is deprecated. Use StreamableHttpTransport instead.
 * This implementation is a placeholder and requires HTTP server integration.
 */
export class SseTransport extends SSEServerTransport {
  readonly type = 'sse' as const;
  readonly bindAddress: string;
  readonly port: number;

  private endpoint: string;
  private eventHandlers: {
    'session:created': Array<(sessionId: string, clientInfo: IClientInfo) => void>;
    'session:closed': Array<(sessionId: string) => void>;
    'message': Array<(sessionId: string, message: JSONRPCMessage) => void>;
  } = {
    'session:created': [],
    'session:closed': [],
    'message': [],
  };

  // Note: SSEServerTransport is created per-request, not per-server
  // This will need to be integrated with HTTP server in Phase 2
  private httpServer?: http.Server;

  constructor(options: SseTransportOptions) {
    super(options.endpoint || '/sse', options.res);
  }

  // SDK Transport methods (delegated to per-request transports)
  async start(): Promise<void> {
    // SSE transport creates transport per-request, so we just create the HTTP server here
    this.httpServer = http.createServer();
    return new Promise((resolve, reject) => {
      this.httpServer!.listen(this.port, this.bindAddress, () => resolve());
      this.httpServer!.on('error', reject);
    });
  }

  async close(): Promise<void> {
    if (this.httpServer) {
      return new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
    }
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

  // SDK Transport.send() - delegated to per-request transports
  async send(message: JSONRPCMessage, options?: any): Promise<void> {
    // SSE transport sends through per-request transports
    // This will be implemented in Phase 2
  }

  // Additional methods for our architecture (not in SDK Transport)
  async connectSdkServer(
    _sdkServer: any,
    _initializeSession: SessionInitializationCallback,
    _defaultDestination?: string
  ): Promise<void> {
    // SSE transport creates transport per-request, not per-server
    // SDK server connection will be handled per-request in Phase 2
  }

  async handleRequest(req: any, res: any): Promise<void> {
    // SSE transport creates transport per-request
    // This will be implemented in Phase 2
  }

  async sendMessage(sessionId: string, message: JSONRPCMessage): Promise<void> {
    // SSE transport sends through per-request transports
    // This will be implemented in Phase 2
  }

  /**
   * Creates SSEServerTransport for a specific request
   * @param res - ServerResponse for the request
   * @returns SSEServerTransport instance
   */
  createTransportForRequest(res: any): SSEServerTransport {
    return new SSEServerTransport(this.endpoint, res);
  }
}
