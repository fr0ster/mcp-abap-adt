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
    const token = await authBroker.getToken(request.destination);

    // 3. Get service key for URL
    const serviceKey = await authBroker.getServiceKey(request.destination);

    return {
      sapUrl: serviceKey.url,
      auth: {
        type: 'jwt',
        jwtToken: token.accessToken,
        refreshToken: token.refreshToken,
      },
      client: serviceKey.client,
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
