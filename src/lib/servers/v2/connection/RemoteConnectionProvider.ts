/**
 * RemoteConnectionProvider implementation
 *
 * Provides connection parameters from client headers (REMOTE mode)
 * No AuthBroker - proxy only mode
 */

import {
  IConnectionProvider,
  IConnectionRequest,
  IConnectionParams,
  IHeaderValidator,
} from '../interfaces/connection.js';

/**
 * RemoteConnectionProvider - REMOTE mode connection provider
 *
 * Extracts connection parameters from client headers via HeaderValidator
 * No service keys or AuthBroker - pure proxy mode
 */
export class RemoteConnectionProvider implements IConnectionProvider {
  readonly mode = 'REMOTE' as const;

  constructor(private headerValidator: IHeaderValidator) {}

  async getConnectionParams(request: IConnectionRequest): Promise<IConnectionParams> {
    if (!request.headers) {
      throw new Error('Headers required for REMOTE mode');
    }

    // Validate and extract parameters from headers
    const validated = await this.headerValidator.validateAndExtract(request.headers);

    return validated;
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
