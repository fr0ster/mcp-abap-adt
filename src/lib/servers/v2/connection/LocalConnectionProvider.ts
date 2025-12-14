/**
 * LocalConnectionProvider implementation
 *
 * Provides connection parameters using service keys and AuthBroker (LOCAL mode)
 * ServiceKeyStore, SessionStore, and TokenProvider are injected into AuthBroker through Factory
 */

import {
  IConnectionProvider,
  IConnectionRequest,
  IConnectionParams,
  IAuthBrokerFactory,
} from '../interfaces/connection.js';

/**
 * LocalConnectionProvider - LOCAL mode connection provider
 *
 * Uses service keys from ServiceKeyStore and AuthBroker for token management
 */
export class LocalConnectionProvider implements IConnectionProvider {
  readonly mode = 'LOCAL' as const;

  constructor(private authBrokerFactory: IAuthBrokerFactory) {}

  async getConnectionParams(request: IConnectionRequest): Promise<IConnectionParams> {
    if (!request.destination) {
      throw new Error('Destination required for LOCAL mode');
    }

    // 1. Create or get AuthBroker for session
    // AuthBroker already has injected ServiceKeyStore, SessionStore, TokenProvider
    const authBroker = await this.authBrokerFactory.getOrCreateBroker(
      request.sessionId,
      request.destination
    );

    // 2. Get/update token through AuthBroker
    // AuthBroker internally uses:
    //   - ServiceKeyStore to read service key
    //   - SessionStore to save/read tokens
    //   - TokenProvider to get new tokens
    // getToken returns JWT token string
    const jwtToken = await authBroker.getToken(request.destination);

    // 3. Get connection config for URL and client
    // Access sessionStore and serviceKeyStore from AuthBrokerFactory
    const authBrokerFactory = this.authBrokerFactory as any;
    let sapUrl: string | undefined;
    let client: string | undefined;

    // Try to get from sessionStore first
    if (authBrokerFactory.sessionStore) {
      const connConfig = await authBrokerFactory.sessionStore.getConnectionConfig(request.destination);
      sapUrl = connConfig?.serviceUrl;
      client = connConfig?.client;
    }

    // Fallback to serviceKeyStore if not in session
    if (!sapUrl && authBrokerFactory.serviceKeyStore) {
      const serviceKeyConnConfig = await authBrokerFactory.serviceKeyStore.getConnectionConfig(request.destination);
      sapUrl = serviceKeyConnConfig?.serviceUrl;
      client = serviceKeyConnConfig?.client;
    }

    if (!sapUrl) {
      throw new Error(`Unable to determine SAP URL for destination: ${request.destination}`);
    }

    return {
      sapUrl,
      auth: {
        type: 'jwt',
        jwtToken,
      },
      client,
    };
  }

  async updateConnectionParams(
    sessionId: string,
    params: Partial<IConnectionParams>
  ): Promise<void> {
    // Update connection params (e.g., after token refresh)
    // This would typically update the session's connectionParams
    // Implementation depends on session management strategy
  }
}
