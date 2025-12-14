/**
 * AuthBrokerFactory implementation
 *
 * Creates and manages AuthBroker instances with injected dependencies
 * (ServiceKeyStore, SessionStore, TokenProvider)
 */

import { AuthBroker, type AuthBrokerConfig } from '@mcp-abap-adt/auth-broker';
import type {
  IServiceKeyStore,
  ISessionStore,
} from '@mcp-abap-adt/auth-broker';
import type { ITokenProvider } from '@mcp-abap-adt/auth-broker';
import { IAuthBrokerFactory } from '../interfaces/connection.js';
import { ILogger } from '@mcp-abap-adt/interfaces';

/**
 * AuthBrokerFactory - creates AuthBroker instances with DI
 *
 * Manages AuthBroker instances per session/destination combination
 */
export class AuthBrokerFactory implements IAuthBrokerFactory {
  private brokers: Map<string, AuthBroker> = new Map();

  // Expose stores for LocalConnectionProvider to access connection config
  public readonly serviceKeyStore: IServiceKeyStore;
  public readonly sessionStore: ISessionStore;

  constructor(
    serviceKeyStore: IServiceKeyStore,
    sessionStore: ISessionStore,
    private tokenProvider?: ITokenProvider,
    private logger?: ILogger
  ) {
    this.serviceKeyStore = serviceKeyStore;
    this.sessionStore = sessionStore;
  }

  async getOrCreateBroker(sessionId: string, destination: string): Promise<AuthBroker> {
    const key = `${sessionId}:${destination}`;

    if (this.brokers.has(key)) {
      return this.brokers.get(key)!;
    }

    // Create new AuthBroker with injected dependencies
    const config: AuthBrokerConfig = {
      sessionStore: this.sessionStore,
      serviceKeyStore: this.serviceKeyStore,
      tokenProvider: this.tokenProvider,
    };

    // Use 'system' browser to open default browser for authentication
    // This will trigger browser-based auth flow when needed
    const broker = new AuthBroker(config, 'system', this.logger);
    this.brokers.set(key, broker);

    return broker;
  }

  getBroker(sessionId: string, destination?: string): AuthBroker | undefined {
    if (destination) {
      const key = `${sessionId}:${destination}`;
      return this.brokers.get(key);
    }
    // Try to find any broker for this session
    for (const [key, broker] of this.brokers.entries()) {
      if (key.startsWith(`${sessionId}:`)) {
        return broker;
      }
    }
    return undefined;
  }

  deleteBroker(sessionId: string, destination?: string): void {
    if (destination) {
      const key = `${sessionId}:${destination}`;
      this.brokers.delete(key);
    } else {
      // Delete all brokers for this session
      const keysToDelete: string[] = [];
      for (const key of this.brokers.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((key) => this.brokers.delete(key));
    }
  }

  clearAll(): void {
    this.brokers.clear();
  }
}
