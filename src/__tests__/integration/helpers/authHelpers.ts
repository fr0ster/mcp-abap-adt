/**
 * Authentication helpers for integration tests
 * Uses AuthBroker to refresh tokens before tests
 *
 * Uses the same approach as mcp-abap-adt/src/index.ts getOrCreateAuthBroker()
 */

import { AuthBroker } from '@mcp-abap-adt/auth-broker';
import { BtpTokenProvider } from '@mcp-abap-adt/auth-providers';
import { getPlatformStoresAsync } from '../../../lib/stores';
import { getPlatformPaths } from '../../../lib/stores/platformPaths';
import { defaultLogger } from '@mcp-abap-adt/logger';
import { loadTestConfig } from './configHelpers';
import { setSapConfigOverride } from '../../../index';
import type { SapConfig } from '@mcp-abap-adt/connection';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * Refresh tokens using AuthBroker before tests
 * This ensures tests have valid tokens even if refresh token in .env has expired
 *
 * Uses the same approach as mcp-abap-adt/src/index.ts getOrCreateAuthBroker():
 * - getPlatformStoresAsync() for auto-detection of store type
 * - BtpTokenProvider() for token acquisition
 * - AuthBroker with stores and token provider
 */
export async function refreshTokensForTests(): Promise<void> {
  try {
    // Skip token refresh if we already have valid tokens in .env
    // This prevents unnecessary AuthBroker calls that might try to open browser
    if (process.env.SAP_JWT_TOKEN && process.env.SAP_URL) {
      if (process.env.DEBUG_TESTS === 'true') {
        console.log('[refreshTokensForTests] Skipping token refresh - tokens already available in .env');
      }
      return;
    }

    const config = loadTestConfig();

    // Check if test config has destination for auth-broker
    // Try multiple possible locations in test-config.yaml
    // Priority: auth_broker.abap.destination (from auth-broker package structure) > abap.destination > environment.destination
    const destination =
      config?.auth_broker?.abap?.destination ||
      config?.abap?.destination ||
      config?.environment?.destination ||
      config?.abap?.service_keys?.destination ||
      config?.abap?.sessions?.destination;

    if (!destination) {
      if (process.env.DEBUG_TESTS === 'true') {
        console.log('[refreshTokensForTests] No destination found in test-config.yaml, skipping token refresh');
      }
      return;
    }

    if (process.env.DEBUG_TESTS === 'true') {
      console.log(`[refreshTokensForTests] Attempting to refresh tokens for destination: ${destination}`);
    }

    // Get paths from test-config.yaml if available
    // Expand ~ to home directory (same as in src/index.ts)
    // Note: getPlatformPaths expects base path and adds 'service-keys'/'sessions' subfolders
    // So we need to extract base path from service_keys_dir or sessions_dir
    const serviceKeysDir = config?.auth_broker?.paths?.service_keys_dir;
    const sessionsDir = config?.auth_broker?.paths?.sessions_dir;
    let customPath: string | undefined = undefined;

    if (serviceKeysDir) {
      // Expand ~ to home directory and resolve to absolute path
      let expandedPath = serviceKeysDir.replace(/^~/, os.homedir());
      expandedPath = path.resolve(expandedPath);

      // If path ends with 'service-keys', remove it to get base path
      // getPlatformPaths will add 'service-keys' and 'sessions' subfolders
      if (expandedPath.endsWith('service-keys') || expandedPath.endsWith(path.join('service-keys', ''))) {
        customPath = path.dirname(expandedPath);
      } else {
        // If path doesn't end with 'service-keys', assume it's base path
        customPath = expandedPath;
      }

      if (process.env.DEBUG_TESTS === 'true') {
        console.log(`[refreshTokensForTests] Service keys dir from config: ${serviceKeysDir}`);
        console.log(`[refreshTokensForTests] Using base path for stores: ${customPath}`);
      }
    } else if (sessionsDir) {
      // If only sessions_dir is provided, extract base path
      let expandedPath = sessionsDir.replace(/^~/, os.homedir());
      expandedPath = path.resolve(expandedPath);

      // If path ends with 'sessions', remove it to get base path
      if (expandedPath.endsWith('sessions') || expandedPath.endsWith(path.join('sessions', ''))) {
        customPath = path.dirname(expandedPath);
      } else {
        // If path doesn't end with 'sessions', assume it's base path
        customPath = expandedPath;
      }

      if (process.env.DEBUG_TESTS === 'true') {
        console.log(`[refreshTokensForTests] Sessions dir from config: ${sessionsDir}`);
        console.log(`[refreshTokensForTests] Using base path for stores: ${customPath}`);
      }
    }

    // Use the same approach as mcp-abap-adt/src/index.ts getOrCreateAuthBroker()
    // Get stores with auto-detection of service key format
    const { serviceKeyStore, sessionStore, storeType } = await getPlatformStoresAsync(
      customPath, // Use paths from test-config.yaml if available, otherwise default paths
      false, // Use safe (in-memory) session store for tests
      destination
    );

    if (process.env.DEBUG_TESTS === 'true') {
      // Log where we're looking for service keys
      const serviceKeysPaths = getPlatformPaths(customPath, 'service-keys');
      console.log(`[refreshTokensForTests] Looking for service key "${destination}.json" in:`, serviceKeysPaths);

      // Check if service key file exists
      for (const serviceKeysPath of serviceKeysPaths) {
        const serviceKeyFile = path.join(serviceKeysPath, `${destination}.json`);
        const exists = fs.existsSync(serviceKeyFile);
        console.log(`[refreshTokensForTests]   ${exists ? '✓' : '✗'} ${serviceKeyFile}`);
      }
    }

    // Determine token provider based on store type (same as in getOrCreateAuthBroker)
    // ABAP and BTP use BtpTokenProvider (browser-based OAuth2)
    const tokenProvider = new BtpTokenProvider();

    // Create AuthBroker (same as in getOrCreateAuthBroker)
    // Use 'system' browser to allow browser authentication if refresh token fails
    // This allows tests to refresh tokens even if refresh token in .env has expired
    const authBroker = new AuthBroker(
      {
        serviceKeyStore,
        sessionStore,
        tokenProvider,
      },
      'system', // Allow browser authentication if refresh token fails
      defaultLogger
    );

    // Try to get fresh token using auth-broker
    // This will try:
    // 1. Session store (if token exists and is valid)
    // 2. Refresh token (if available in session store or .env)
    // 3. UAA client_credentials (if UAA credentials available)
    // 4. Browser authentication (if all above fail and browser is set to 'system')
    try {
      // Check if we already have a valid token in session store (without triggering authentication)
      let existingConnConfig;
      try {
        existingConnConfig = await authBroker.getConnectionConfig(destination);
      } catch (error) {
        // If getConnectionConfig fails, continue to try getToken
        existingConnConfig = null;
      }

      if (existingConnConfig?.authorizationToken) {
        if (process.env.DEBUG_TESTS === 'true') {
          console.log('[refreshTokensForTests] Using existing token from session store');
        }
        // Update process.env with existing token
        process.env.SAP_URL = existingConnConfig.serviceUrl;
        process.env.SAP_JWT_TOKEN = existingConnConfig.authorizationToken;
        return;
      }

      // Try to get new token using auth-broker
      // This will try refresh token first, then UAA, then browser if needed
      if (process.env.DEBUG_TESTS === 'true') {
        console.log('[refreshTokensForTests] Attempting to get token via auth-broker (will try refresh token, UAA, then browser if needed)');
      }
      const token = await authBroker.getToken(destination);
      const connConfig = await authBroker.getConnectionConfig(destination);

      if (token && connConfig?.serviceUrl) {
        // Update process.env with fresh tokens
        process.env.SAP_URL = connConfig.serviceUrl;
        process.env.SAP_JWT_TOKEN = connConfig.authorizationToken || token;

        // Get authorization config for refresh token
        const authConfig = await authBroker.getAuthorizationConfig(destination);
        if (authConfig?.refreshToken) {
          process.env.SAP_REFRESH_TOKEN = authConfig.refreshToken;
        }
        if (authConfig?.uaaUrl) {
          process.env.SAP_UAA_URL = authConfig.uaaUrl;
        }
        if (authConfig?.uaaClientId) {
          process.env.SAP_UAA_CLIENT_ID = authConfig.uaaClientId;
        }
        if (authConfig?.uaaClientSecret) {
          process.env.SAP_UAA_CLIENT_SECRET = authConfig.uaaClientSecret;
        }

        // Also update config override for getManagedConnection
        const updatedConfig: SapConfig = {
          url: connConfig.serviceUrl,
          authType: 'jwt',
          jwtToken: connConfig.authorizationToken || token,
        };

        if (authConfig?.refreshToken) {
          updatedConfig.refreshToken = authConfig.refreshToken;
        }
        if (authConfig?.uaaUrl) {
          updatedConfig.uaaUrl = authConfig.uaaUrl;
        }
        if (authConfig?.uaaClientId) {
          updatedConfig.uaaClientId = authConfig.uaaClientId;
        }
        if (authConfig?.uaaClientSecret) {
          updatedConfig.uaaClientSecret = authConfig.uaaClientSecret;
        }

        // Get client and language from connection config or process.env
        if (connConfig.sapClient) {
          updatedConfig.client = connConfig.sapClient;
        } else if (process.env.SAP_CLIENT) {
          updatedConfig.client = process.env.SAP_CLIENT.trim();
        }
        if (connConfig.language) {
          (updatedConfig as any).language = connConfig.language;
        } else if (process.env.SAP_LANGUAGE) {
          (updatedConfig as any).language = process.env.SAP_LANGUAGE.trim();
        }

        setSapConfigOverride(updatedConfig);

        if (process.env.DEBUG_TESTS === 'true') {
          console.log('[refreshTokensForTests] ✓ Tokens refreshed successfully');
          console.log(`[refreshTokensForTests] URL: ${connConfig.serviceUrl}`);
          console.log(`[refreshTokensForTests] Token length: ${token.length}`);
          console.log(`[refreshTokensForTests] Has refresh token: ${!!authConfig?.refreshToken}`);
        }
      }
    } catch (error: any) {
      // If token refresh fails, log but don't fail tests
      // Tests will use existing .env tokens (may fail if expired, but that's expected)
      if (process.env.DEBUG_TESTS === 'true') {
        console.warn(`[refreshTokensForTests] Failed to refresh tokens: ${error?.message || String(error)}`);
        console.warn(`[refreshTokensForTests] Tests will use existing .env tokens (may fail if expired)`);
      }
    }
  } catch (error: any) {
    // If AuthBroker setup fails, log but don't fail tests
    if (process.env.DEBUG_TESTS === 'true') {
      console.warn(`[refreshTokensForTests] Failed to setup AuthBroker: ${error?.message || String(error)}`);
      console.warn(`[refreshTokensForTests] Tests will use existing .env tokens`);
    }
  }
}

