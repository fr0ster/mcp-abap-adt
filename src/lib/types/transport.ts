/**
 * Transport-related types
 *
 * Types used by transports but not part of SDK Transport interface
 */

import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

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
 * Session initialization callback
 * Called by transport when session needs to be initialized
 * @param sessionId - Session identifier
 * @param clientInfo - Client information
 * @param destination - Optional destination name (for LOCAL mode)
 * @returns Promise that resolves when session is initialized
 */
export type SessionInitializationCallback = (
  sessionId: string,
  clientInfo: IClientInfo,
  destination?: string
) => Promise<void>;
