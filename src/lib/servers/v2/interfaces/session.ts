/**
 * Session management interfaces
 *
 * Session manager manages sessions that contain connection parameters to ABAP environment
 */

import { IClientInfo } from './transport.js';
import { IConnectionParams } from './connection.js';

/**
 * Unified session interface
 *
 * Single session type with two session IDs:
 * - clientSessionId: Identifies the client connection (UUID, managed by server)
 * - abapSessionId: Identifies the SAP ABAP connection (SAP_SESSIONID cookie, optional)
 */
export interface ISession {
  /**
   * Client session ID - identifies the client connection
   * UUID, managed by server
   */
  readonly clientSessionId: string;

  /** Session creation timestamp */
  readonly createdAt: Date;

  /** Last activity timestamp */
  lastActivity: Date;

  /**
   * Connection parameters to ABAP environment
   * This is the main session information - how to connect to SAP system
   * Required field
   */
  connectionParams: IConnectionParams;

  /**
   * SAP ABAP session (optional) - only present when SAP cookies are available
   * Used for stateful operations (lock, unlock, etc.)
   */
  abapSession?: {
    /** SAP_SESSIONID cookie value */
    abapSessionId: string;
    /** All SAP cookies for stateful operations */
    cookies: string[];
    /** X-CSRF-Token (optional) */
    securityToken?: string;
  };

  /** Session metadata */
  metadata: {
    /** Transport type */
    transport: 'stdio' | 'sse' | 'http';
    /** Client IP address (if available) */
    clientIP?: string;
    /** Request count */
    requestCount: number;
    /** Error count */
    errorCount: number;
  };
}

/**
 * Session manager interface
 *
 * Manages sessions that contain connection parameters to ABAP environment
 */
export interface ISessionManager {
  /**
   * Creates a new session with clientSessionId
   * @param clientInfo - Information about the client connection
   * @returns New session with clientSessionId (UUID) and connectionParams
   */
  createSession(clientInfo: IClientInfo): ISession;

  /**
   * Gets session by clientSessionId
   * @param clientSessionId - Client session identifier
   * @returns Session or undefined if not found
   */
  getSession(clientSessionId: string): ISession | undefined;

  /**
   * Deletes session by clientSessionId
   * @param clientSessionId - Client session identifier
   */
  deleteSession(clientSessionId: string): void;

  /**
   * Sets SAP ABAP session cookies when received from SAP
   * @param clientSessionId - Client session ID
   * @param sapCookies - Cookies from SAP response (Set-Cookie headers)
   */
  setAbapSession(clientSessionId: string, sapCookies: string[]): void;

  /**
   * Clears SAP ABAP session (e.g., on expiry or cleanup)
   * @param clientSessionId - Client session ID
   */
  clearAbapSession(clientSessionId: string): void;

  /**
   * Register event handler
   * @param event - Event name
   * @param handler - Event handler function
   */
  on(event: 'created', handler: (session: ISession) => void): void;
  on(event: 'closed', handler: (session: ISession) => void): void;
  on(event: 'abapSessionSet', handler: (session: ISession) => void): void;
}
