/**
 * Session management types and utilities for MCP transports
 */

import { SapConfig } from "@mcp-abap-adt/connection";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

/**
 * HTTP session information for StreamableHTTP transport
 */
export interface HttpSession {
  /** Unique session identifier */
  sessionId: string;
  /** Client IP address */
  clientIP: string;
  /** When the session was created */
  connectedAt: Date;
  /** Number of requests in this session */
  requestCount: number;
  /** SAP config for this session (from headers) */
  sapConfig?: SapConfig;
  /** Destination name for AuthBroker-based token refresh */
  destination?: string;
}

/**
 * SSE session information
 */
export interface SseSession {
  /** Per-session MCP server instance */
  server: McpServer;
  /** SSE transport for this session */
  transport: SSEServerTransport;
}

/**
 * Session context for AsyncLocalStorage
 */
export interface SessionContext {
  /** Unique session identifier */
  sessionId: string;
  /** SAP configuration for this session */
  sapConfig?: SapConfig;
  /** Destination name for this session */
  destination?: string;
}

/**
 * Create a new HTTP session
 */
export function createHttpSession(
  sessionId: string,
  clientIP: string
): HttpSession {
  return {
    sessionId,
    clientIP,
    connectedAt: new Date(),
    requestCount: 0,
  };
}

/**
 * Generate a client key from socket info
 */
export function createClientKey(remoteAddress?: string, remotePort?: number): string {
  return `${remoteAddress || 'unknown'}:${remotePort || 0}`;
}

/**
 * Extract session ID from HTTP headers
 */
export function extractSessionIdFromHeaders(headers: Record<string, string | string[] | undefined>): string | undefined {
  const sessionId = headers["x-session-id"] || headers["mcp-session-id"];
  return typeof sessionId === 'string' ? sessionId : undefined;
}
