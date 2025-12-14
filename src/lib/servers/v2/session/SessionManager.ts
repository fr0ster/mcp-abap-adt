/**
 * SessionManager implementation
 *
 * Manages sessions that contain connection parameters to ABAP environment
 */

import { randomUUID } from 'crypto';
import {
  ISessionManager,
  ISession,
} from '../interfaces/session.js';
import { IConnectionParams } from '../interfaces/connection.js';
import { IClientInfo } from '../types/transport.js';

/**
 * SessionManager - manages client sessions with ABAP connection parameters
 */
export class SessionManager implements ISessionManager {
  private sessions: Map<string, ISession> = new Map();
  private eventHandlers: {
    created: Array<(session: ISession) => void>;
    closed: Array<(session: ISession) => void>;
    abapSessionSet: Array<(session: ISession) => void>;
  } = {
    created: [],
    closed: [],
    abapSessionSet: [],
  };

  createSession(clientInfo: IClientInfo): ISession {
    const clientSessionId = randomUUID();
    const now = new Date();

    const session: ISession = {
      clientSessionId,
      createdAt: now,
      lastActivity: now,
      connectionParams: {
        // ConnectionParams will be set later by ConnectionProvider
        sapUrl: '',
        auth: {
          type: 'jwt',
        },
      },
      metadata: {
        transport: clientInfo.transport,
        clientIP: clientInfo.ip,
        requestCount: 0,
        errorCount: 0,
      },
    };

    this.sessions.set(clientSessionId, session);
    this.emit('created', session);

    return session;
  }

  getSession(clientSessionId: string): ISession | undefined {
    const session = this.sessions.get(clientSessionId);
    if (session) {
      session.lastActivity = new Date();
    }
    return session;
  }

  deleteSession(clientSessionId: string): void {
    const session = this.sessions.get(clientSessionId);
    if (session) {
      this.sessions.delete(clientSessionId);
      this.emit('closed', session);
    }
  }

  setAbapSession(clientSessionId: string, sapCookies: string[]): void {
    const session = this.sessions.get(clientSessionId);
    if (!session) {
      throw new Error(`Session not found: ${clientSessionId}`);
    }

    // Extract SAP_SESSIONID from cookies
    let abapSessionId = '';
    let securityToken: string | undefined;

    for (const cookie of sapCookies) {
      const match = cookie.match(/SAP_SESSIONID=([^;]+)/);
      if (match) {
        abapSessionId = match[1];
      }

      // Extract X-CSRF-Token if present
      const csrfMatch = cookie.match(/X-CSRF-Token=([^;]+)/);
      if (csrfMatch) {
        securityToken = csrfMatch[1];
      }
    }

    if (!abapSessionId) {
      throw new Error('SAP_SESSIONID not found in cookies');
    }

    session.abapSession = {
      abapSessionId,
      cookies: sapCookies,
      securityToken,
    };

    this.emit('abapSessionSet', session);
  }

  clearAbapSession(clientSessionId: string): void {
    const session = this.sessions.get(clientSessionId);
    if (session) {
      delete session.abapSession;
    }
  }

  on(event: 'created', handler: (session: ISession) => void): void;
  on(event: 'closed', handler: (session: ISession) => void): void;
  on(event: 'abapSessionSet', handler: (session: ISession) => void): void;
  on(event: string, handler: (...args: any[]) => void): void {
    if (event === 'created' || event === 'closed' || event === 'abapSessionSet') {
      this.eventHandlers[event].push(handler as any);
    }
  }

  private emit(event: 'created', session: ISession): void;
  private emit(event: 'closed', session: ISession): void;
  private emit(event: 'abapSessionSet', session: ISession): void;
  private emit(event: string, session: ISession): void {
    if (event === 'created' || event === 'closed' || event === 'abapSessionSet') {
      this.eventHandlers[event].forEach((handler) => {
        handler(session);
      });
    }
  }

  /**
   * Updates connection parameters for a session
   * @param clientSessionId - Client session ID
   * @param connectionParams - Connection parameters
   */
  updateConnectionParams(clientSessionId: string, connectionParams: IConnectionParams): void {
    const session = this.sessions.get(clientSessionId);
    if (!session) {
      throw new Error(`Session not found: ${clientSessionId}`);
    }

    session.connectionParams = connectionParams;
    session.lastActivity = new Date();
  }

  /**
   * Gets all active sessions
   * @returns Array of active sessions
   */
  getAllSessions(): ISession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Clears all sessions
   */
  clearAll(): void {
    for (const session of this.sessions.values()) {
      this.emit('closed', session);
    }
    this.sessions.clear();
  }
}
