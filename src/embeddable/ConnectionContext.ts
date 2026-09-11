import type { SapConfig } from '@mcp-abap-adt/connection';

/**
 * Connection context for MCP server
 * Contains connection parameters and session information
 */
export interface ConnectionContext {
  /**
   * Connection parameters (SAP URL, auth, client)
   */
  connectionParams: SapConfig;

  /**
   * Session ID for this connection context
   */
  sessionId: string;

  /**
   * Optional metadata for additional context information
   */
  metadata?: Record<string, any>;
}
