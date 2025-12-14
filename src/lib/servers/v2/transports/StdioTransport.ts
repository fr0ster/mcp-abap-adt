/**
 * StdioTransport implementation
 *
 * Extends StdioServerTransport from MCP SDK for stdio communication
 * Always runs in LOCAL mode (bindAddress = '127.0.0.1')
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { IClientInfo, SessionInitializationCallback } from '../types/transport.js';

/**
 * StdioTransport - standard input/output transport
 *
 * Single global session, reads from stdin, writes to stdout
 * Extends SDK StdioServerTransport and adds our architecture methods
 */
export class StdioTransport extends StdioServerTransport {
  readonly type = 'stdio' as const;
  readonly bindAddress = '127.0.0.1'; // Always local
  readonly port?: number = undefined; // Not applicable for stdio

  private eventHandlers: {
    'session:created': Array<(sessionId: string, clientInfo: IClientInfo) => void>;
    'session:closed': Array<(sessionId: string) => void>;
    'message': Array<(sessionId: string, message: JSONRPCMessage) => void>;
  } = {
    'session:created': [],
    'session:closed': [],
    'message': [],
  };

  private readonly globalSessionId = 'stdio-session';

  constructor() {
    super(); // Call SDK transport constructor
  }

  async connectSdkServer(
    sdkServer: any,
    initializeSession: SessionInitializationCallback,
    defaultDestination?: string
  ): Promise<void> {
    // Connect SDK server to stdio transport (we are the SDK transport)
    await sdkServer.server.connect(this);

    // Create stdio session and initialize it immediately
    // Stdio has a single global session
    const clientInfo: IClientInfo = {
      transport: 'stdio',
    };

    try {
      // Initialize session (create session, get connection params, set context)
      await initializeSession(this.globalSessionId, clientInfo, defaultDestination);

      // Emit session:created event after initialization
      this.emit('session:created', this.globalSessionId, clientInfo);
    } catch (error) {
      // Write errors to stderr for stdio transport
      const errorMsg = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[ERROR] Failed to initialize stdio session: ${errorMsg}\n`);
      // Don't throw - let SDK handle it
    }
  }

  async close(): Promise<void> {
    this.emit('session:closed', this.globalSessionId);
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
  // SDK Transport already has send(message, options) - we don't override it
  async sendMessage(sessionId: string, message: JSONRPCMessage): Promise<void> {
    // For stdio, we only have one session
    if (sessionId !== this.globalSessionId) {
      throw new Error(`Invalid session ID for stdio transport: ${sessionId}`);
    }
    // Use SDK send() directly
    await this.send(message);
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
