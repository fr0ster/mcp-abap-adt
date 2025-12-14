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

import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ITransport, IClientInfo, McpMessage } from '../interfaces/transport.js';

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
export class SseTransport implements ITransport {
  readonly type = 'sse' as const;
  readonly bindAddress: string;
  readonly port: number;

  private endpoint: string;
  private eventHandlers: {
    'session:created': Array<(sessionId: string, clientInfo: IClientInfo) => void>;
    'session:closed': Array<(sessionId: string) => void>;
    'message': Array<(sessionId: string, message: McpMessage) => void>;
  } = {
    'session:created': [],
    'session:closed': [],
    'message': [],
  };

  // Note: SSEServerTransport is created per-request, not per-server
  // This will need to be integrated with HTTP server in Phase 2
  private httpServer?: any; // HTTP server will be created in start()

  constructor(options: SseTransportOptions) {
    this.port = options.port;
    this.bindAddress = options.host;
    this.endpoint = options.endpoint || '/sse';
  }

  async start(): Promise<void> {
    // TODO: Create HTTP server and integrate SSEServerTransport per-request
    // SSEServerTransport requires endpoint + ServerResponse per request
    // This will be implemented in Phase 2 when integrating with HTTP server
  }

  async stop(): Promise<void> {
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
    // Send message through SDK transport
    // SDK transport handles message sending internally
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
