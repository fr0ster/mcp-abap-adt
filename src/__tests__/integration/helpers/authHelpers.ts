/**
 * Authentication helpers for integration tests
 * Uses AuthBrokerFactory to create broker and load tokens into process.env for tests
 */

import * as path from 'node:path';
import type { ILogger } from '@mcp-abap-adt/interfaces';
import {
  DefaultLogger,
  defaultLogger,
  getLogLevel,
} from '@mcp-abap-adt/logger';
import { AuthBrokerFactory } from '../../../lib/auth/brokerFactory';
import { loadTestConfig } from './configHelpers';
import { createTestLogger } from './loggerHelpers';

const authLogger = createTestLogger('auth');

/**
 * Create logger for stores based on DEBUG_STORES or DEBUG_AUTH_STORES environment variable
 * Returns DefaultLogger from @mcp-abap-adt/logger if enabled, undefined otherwise
 */
export function createStoreLogger(): ILogger | undefined {
  const isEnabled = (): boolean => {
    if (
      process.env.DEBUG_STORES === 'false' ||
      process.env.DEBUG_AUTH_STORES === 'false'
    ) {
      return false;
    }
    if (
      process.env.DEBUG_STORES === 'true' ||
      process.env.DEBUG_AUTH_STORES === 'true' ||
      process.env.DEBUG === 'true' ||
      process.env.DEBUG?.includes('stores') === true ||
      process.env.DEBUG?.includes('auth-stores') === true
    ) {
      return true;
    }
    return false;
  };

  if (isEnabled()) {
    return new DefaultLogger(getLogLevel());
  }

  return undefined;
}

/**
 * Create logger for provider based on DEBUG_PROVIDER or DEBUG_AUTH_PROVIDERS environment variable
 * Returns DefaultLogger from @mcp-abap-adt/logger if enabled, undefined otherwise
 */
export function createProviderLogger(): ILogger | undefined {
  const isEnabled = (): boolean => {
    if (
      process.env.DEBUG_PROVIDER === 'false' ||
      process.env.DEBUG_AUTH_PROVIDERS === 'false'
    ) {
      return false;
    }
    if (
      process.env.DEBUG_PROVIDER === 'true' ||
      process.env.DEBUG_AUTH_PROVIDERS === 'true' ||
      process.env.DEBUG === 'true' ||
      process.env.DEBUG?.includes('provider') === true ||
      process.env.DEBUG?.includes('auth-providers') === true
    ) {
      return true;
    }
    return false;
  };

  if (isEnabled()) {
    return new DefaultLogger(getLogLevel());
  }

  return undefined;
}

/**
 * Create logger for broker based on DEBUG_BROKER or DEBUG_AUTH_BROKER environment variable
 * Returns DefaultLogger from @mcp-abap-adt/logger if enabled, undefined otherwise
 */
export function createBrokerLogger(): ILogger | undefined {
  const isEnabled = (): boolean => {
    if (
      process.env.DEBUG_BROKER === 'false' ||
      process.env.DEBUG_AUTH_BROKER === 'false'
    ) {
      return false;
    }
    if (
      process.env.DEBUG_BROKER === 'true' ||
      process.env.DEBUG_AUTH_BROKER === 'true' ||
      process.env.DEBUG === 'true' ||
      process.env.DEBUG?.includes('broker') === true ||
      process.env.DEBUG?.includes('auth-broker') === true
    ) {
      return true;
    }
    return false;
  };

  if (isEnabled()) {
    return new DefaultLogger(getLogLevel());
  }

  return undefined;
}

/**
 * Create logger for connection based on DEBUG_CONNECTION, DEBUG_CONN, or DEBUG_CONNECTORS environment variable
 * Returns DefaultLogger from @mcp-abap-adt/logger if enabled, undefined otherwise
 */
export function createConnectionLogger(): ILogger | undefined {
  const isEnabled = (): boolean => {
    if (
      process.env.DEBUG_CONNECTION === 'false' ||
      process.env.DEBUG_CONN === 'false' ||
      process.env.DEBUG_CONNECTORS === 'false'
    ) {
      return false;
    }
    if (
      process.env.DEBUG_CONNECTION === 'true' ||
      process.env.DEBUG_CONN === 'true' ||
      process.env.DEBUG_CONNECTORS === 'true' ||
      process.env.DEBUG === 'true' ||
      process.env.DEBUG?.includes('connection') === true ||
      process.env.DEBUG?.includes('conn') === true ||
      process.env.DEBUG?.includes('connectors') === true
    ) {
      return true;
    }
    return false;
  };

  if (isEnabled()) {
    return new DefaultLogger(getLogLevel());
  }

  return undefined;
}

/**
 * Create AuthBroker using AuthBrokerFactory and load tokens into process.env for tests
 * Simple logic:
 * - If destination is specified → use factory to create broker
 * - If destination is not specified → skip (tests will use .env directly)
 * Provider handles token refresh automatically - we just get token via broker.getToken()
 */
export async function setupAuthBrokerForTests(_options?: {
  force?: boolean;
}): Promise<void> {
  try {
    const config = loadTestConfig();

    // Get destination from config
    const destination =
      config?.auth_broker?.abap?.destination ||
      config?.abap?.destination ||
      config?.environment?.destination;

    // If no destination, skip (tests will use .env)
    if (!destination) {
      authLogger?.debug(
        '[setupAuthBrokerForTests] No destination found, skipping (tests will use .env)',
      );
      return;
    }

    // Get paths from config
    // service_keys_dir is ALWAYS a base path - factory will add service-keys/sessions subfolders
    const serviceKeysDir = config?.auth_broker?.paths?.service_keys_dir;
    const useUnsafe =
      process.env.MCP_UNSAFE === 'true' ||
      config?.auth_broker?.unsafe === true ||
      config?.auth_broker?.unsafe_session_store === true;

    // Create factory config - basePath is the parent directory for service-keys and sessions
    const basePath = serviceKeysDir
      ? path.resolve(serviceKeysDir.replace(/^~/, require('node:os').homedir()))
      : undefined;

    // Create loggers based on environment variables
    // Only pass loggers if DEBUG variables are set - no default logger to prevent unwanted logs
    const storeLogger = createStoreLogger();
    const providerLogger = createProviderLogger();
    const brokerLogger = createBrokerLogger();

    const factory = new AuthBrokerFactory({
      defaultMcpDestination: destination,
      defaultDestination: destination,
      authBrokerPath: basePath,
      unsafe: useUnsafe,
      transportType: 'stdio', // Tests use stdio transport
      useAuthBroker: true,
      browserAuthPort: config?.auth_broker?.browser_auth_port ?? 3101,
      browser: 'system',
      // Don't pass default logger - only pass specific loggers if DEBUG vars are set
      logger: undefined,
      storeLogger, // Only if DEBUG_STORES is set
      providerLogger, // Only if DEBUG_PROVIDER is set
      brokerLogger, // Only if DEBUG_BROKER is set
    });

    // Get or create broker for destination
    const authBroker = await factory.getOrCreateAuthBroker(destination);
    if (!authBroker) {
      throw new Error(
        `Failed to create AuthBroker for destination "${destination}".`,
      );
    }

    // Get token via broker (provider handles refresh automatically)
    const token = await authBroker.getToken(destination);
    const connConfigResult = await authBroker.getConnectionConfig(destination);

    // Update process.env with tokens from broker
    if (token && connConfigResult?.serviceUrl) {
      process.env.SAP_URL = connConfigResult.serviceUrl;
      process.env.SAP_JWT_TOKEN = connConfigResult.authorizationToken || token;

      const authConfigResult =
        await authBroker.getAuthorizationConfig(destination);
      if (authConfigResult?.refreshToken) {
        process.env.SAP_REFRESH_TOKEN = authConfigResult.refreshToken;
      }
      if (authConfigResult?.uaaUrl) {
        process.env.SAP_UAA_URL = authConfigResult.uaaUrl;
      }
      if (authConfigResult?.uaaClientId) {
        process.env.SAP_UAA_CLIENT_ID = authConfigResult.uaaClientId;
      }
      if (authConfigResult?.uaaClientSecret) {
        process.env.SAP_UAA_CLIENT_SECRET = authConfigResult.uaaClientSecret;
      }
    }
  } catch (error: any) {
    authLogger?.warn(
      `[setupAuthBrokerForTests] Failed: ${error?.message || String(error)}`,
    );
  }
}
