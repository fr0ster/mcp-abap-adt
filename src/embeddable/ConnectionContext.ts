import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';

/**
 * Connection context for MCP server: what a connection is built from.
 * The settings and the credential are separate facts from separate sources.
 */
export interface ConnectionContext {
  /**
   * The connector's settings (URL, client, auth type, connection type).
   * They hold no secret: the credential holds it.
   */
  connectionParams: SapConfig;

  /**
   * The credential the connector presents: a destination's provider
   * (`IDestinations.getProvider`) or the one the request headers carry
   * (`credentialFromHeaders`).
   */
  credential: IAuthProvider;

  /**
   * Session ID for this connection context
   */
  sessionId: string;

  /**
   * Optional metadata for additional context information
   */
  metadata?: Record<string, any>;
}
