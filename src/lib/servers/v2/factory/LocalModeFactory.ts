/**
 * LocalModeFactory
 *
 * Factory for creating all LOCAL mode components with proper DI
 */

import { AuthBrokerFactory } from './AuthBrokerFactory.js';
import { LocalConnectionProvider } from '../connection/LocalConnectionProvider.js';
import type {
  IServiceKeyStore,
  ISessionStore,
} from '@mcp-abap-adt/auth-broker';
import type { ITokenProvider } from '@mcp-abap-adt/auth-broker';
import { IAuthBrokerFactory, IConnectionProvider } from '../interfaces/connection.js';
import { ILogger } from '@mcp-abap-adt/interfaces';

/**
 * Configuration for LOCAL mode factory
 */
export interface LocalModeConfig {
  serviceKeyStore: IServiceKeyStore;
  sessionStore: ISessionStore;
  tokenProvider?: ITokenProvider;
  logger?: ILogger;
}

/**
 * LocalModeFactory - creates all LOCAL mode components
 *
 * Assembles ServiceKeyStore, SessionStore, TokenProvider into
 * AuthBrokerFactory and LocalConnectionProvider
 */
export class LocalModeFactory {
  private authBrokerFactory: IAuthBrokerFactory;

  constructor(private config: LocalModeConfig) {
    // Create AuthBrokerFactory with injected dependencies
    this.authBrokerFactory = new AuthBrokerFactory(
      config.serviceKeyStore,
      config.sessionStore,
      config.tokenProvider,
      config.logger
    );
  }

  /**
   * Creates LocalConnectionProvider
   */
  createConnectionProvider(): IConnectionProvider {
    return new LocalConnectionProvider(this.authBrokerFactory);
  }

  /**
   * Gets AuthBrokerFactory (for direct access if needed)
   */
  getAuthBrokerFactory(): IAuthBrokerFactory {
    return this.authBrokerFactory;
  }
}
