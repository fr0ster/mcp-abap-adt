/**
 * StdioTransport implementation
 *
 * Wraps StdioServerTransport from MCP SDK for stdio communication
 * Always runs in LOCAL mode (bindAddress = '127.0.0.1')
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ITransport, IClientInfo, McpMessage } from '../interfaces/transport.js';

/**
 * StdioTransport - standard input/output transport
 *
 * Single global session, reads from stdin, writes to stdout
 */
export class StdioTransport implements ITransport {
  readonly type = 'stdio' as const;
  readonly bindAddress = '127.0.0.1'; // Always local
  readonly port?: number = undefined; // Not applicable for stdio

  private sdkTransport: StdioServerTransport;
  private eventHandlers: {
    'session:created': Array<(sessionId: string, clientInfo: IClientInfo) => void>;
    'session:closed': Array<(sessionId: string) => void>;
    'message': Array<(sessionId: string, message: McpMessage) => void>;
  } = {
    'session:created': [],
    'session:closed': [],
    'message': [],
  };

  private readonly globalSessionId = 'stdio-session';

  constructor() {
    this.sdkTransport = new StdioServerTransport();
  }

  async start(): Promise<void> {
    await this.sdkTransport.start();

    // Emit session:created event for stdio (single global session)
    const clientInfo: IClientInfo = {
      transport: 'stdio',
    };

    this.emit('session:created', this.globalSessionId, clientInfo);
  }

  async stop(): Promise<void> {
    this.emit('session:closed', this.globalSessionId);
    // SDK transport doesn't have explicit stop method
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
    // For stdio, we only have one session
    if (sessionId !== this.globalSessionId) {
      throw new Error(`Invalid session ID for stdio transport: ${sessionId}`);
    }

    // Send message through SDK transport
    // Note: SDK transport handles message sending internally
    // This is a placeholder for the interface contract
  }

  private emit(event: 'session:created', sessionId: string, clientInfo: IClientInfo): void;
  private emit(event: 'session:closed', sessionId: string): void;
  private emit(event: 'message', sessionId: string, message: McpMessage): void;
  private emit(event: string, ...args: any[]): void {
    if (event === 'session:created' || event === 'session:closed' || event === 'message') {
      this.eventHandlers[event].forEach((handler) => {
        handler(...args);
      });
    }
  }

  /**
   * Gets the SDK transport instance (for direct access if needed)
   */
  getSdkTransport(): StdioServerTransport {
    return this.sdkTransport;
  }
}
