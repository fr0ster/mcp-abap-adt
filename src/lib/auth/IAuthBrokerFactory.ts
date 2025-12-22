/**
 * Interface for AuthBrokerFactory
 * Allows different implementations for different server versions
 */

import type { AuthBroker } from '@mcp-abap-adt/auth-broker';

export interface IAuthBrokerFactory {
  /**
   * Initialize default broker based on CLI args and .env file presence
   * Called once at server startup
   */
  initializeDefaultBroker(): Promise<void>;

  /**
   * Get or create auth broker for specific destination
   * If destination already has broker, returns existing one
   * Otherwise creates new broker with serviceKeyStore
   */
  getOrCreateAuthBroker(destination?: string): Promise<AuthBroker | undefined>;
}
