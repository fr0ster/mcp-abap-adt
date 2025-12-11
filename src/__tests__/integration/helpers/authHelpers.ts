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
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { createTestLogger } from './loggerHelpers';

const authLogger = createTestLogger('auth');

/**
 * Refresh tokens using AuthBroker before tests
 * This ensures tests have valid tokens even if refresh token in .env has expired
 *
 * Uses the same approach as mcp-abap-adt/src/index.ts getOrCreateAuthBroker():
 * - getPlatformStoresAsync() for auto-detection of store type
 * - BtpTokenProvider() for token acquisition
 * - AuthBroker with stores and token provider
 */
export async function refreshTokensForTests(options?: { force?: boolean }): Promise<void> {
  try {
    const force = options?.force === true;
    // Skip token refresh if we already have valid tokens in .env
    // This prevents unnecessary AuthBroker calls that might try to open browser
    if (!force && process.env.SAP_JWT_TOKEN && process.env.SAP_URL) {
      authLogger.debug('[refreshTokensForTests] Skipping token refresh - tokens already available in .env');
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
      authLogger.debug('[refreshTokensForTests] No destination found in test-config.yaml, skipping token refresh');
      return;
    }

    // Prefer file-based session store in tests when requested (to reuse saved sessions)
    const useUnsafe =
      process.env.MCP_UNSAFE === 'true' ||
      config?.auth_broker?.unsafe === true ||
      config?.auth_broker?.unsafe_session_store === true;
    if (useUnsafe) {
      process.env.MCP_UNSAFE = 'true';
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

      authLogger.debug(`[refreshTokensForTests] Service keys dir from config: ${serviceKeysDir}`);
      authLogger.debug(`[refreshTokensForTests] Using base path for stores: ${customPath}`);
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

      authLogger.debug(`[refreshTokensForTests] Sessions dir from config: ${sessionsDir}`);
      authLogger.debug(`[refreshTokensForTests] Using base path for stores: ${customPath}`);
    }

    // Use the same approach as mcp-abap-adt/src/index.ts getOrCreateAuthBroker()
    // Get stores with auto-detection of service key format
    const { serviceKeyStore, sessionStore, storeType } = await getPlatformStoresAsync(
      customPath, // Use paths from test-config.yaml if available, otherwise default paths
      useUnsafe, // File-based sessions allowed for tests
      destination
    );

    let serviceKeyExists = false;
    authLogger.info(`[refreshTokensForTests] Attempting to refresh tokens for destination: ${destination}`);
    if (useUnsafe) {
      authLogger.info('[refreshTokensForTests] Unsafe session store enabled (file-based)');
    }

    // Log where we're looking for service keys
    const serviceKeysPaths = getPlatformPaths(customPath, 'service-keys');
    authLogger.debug(
      `[refreshTokensForTests] Looking for service key "${destination}.json" in: ${JSON.stringify(serviceKeysPaths)}`
    );

    // Check if service key file exists
    for (const serviceKeysPath of serviceKeysPaths) {
      const serviceKeyFile = path.join(serviceKeysPath, `${destination}.json`);
      const exists = fs.existsSync(serviceKeyFile);
      if (exists) {
        serviceKeyExists = true;
      }
      authLogger.debug(`[refreshTokensForTests]   ${exists ? '✓' : '✗'} ${serviceKeyFile}`);
    }

    if (!serviceKeyExists) {
      throw new Error(
        `Auth-broker destination \"${destination}\" not found in service-keys directories. ` +
        `Provide ${destination}.json or disable auth-broker for tests.`
      );
    }

    // Use existing session token if present to avoid browser auth
    const existingConnConfig = await sessionStore.getConnectionConfig(destination);
    if (existingConnConfig?.authorizationToken && existingConnConfig?.serviceUrl) {
      process.env.SAP_URL = existingConnConfig.serviceUrl;
      process.env.SAP_JWT_TOKEN = existingConnConfig.authorizationToken;
      authLogger.info('[refreshTokensForTests] Using existing token from session store (no browser)');
      return;
    }

    // Determine token provider based on store type (same as in getOrCreateAuthBroker)
    // ABAP and BTP use BtpTokenProvider (browser-based OAuth2)
    const browserAuthPort =
      (process.env.MCP_BROWSER_AUTH_PORT ? Number(process.env.MCP_BROWSER_AUTH_PORT) : undefined) ||
      (config?.auth_broker?.browser_auth_port ?? 3101);
    const tokenProvider = new BtpTokenProvider(browserAuthPort);

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
        authLogger.info('[refreshTokensForTests] Using existing token from session store');
        // Update process.env with existing token
        process.env.SAP_URL = existingConnConfig.serviceUrl;
        process.env.SAP_JWT_TOKEN = existingConnConfig.authorizationToken;
        return;
      }

      // Try to get new token using auth-broker
      // This will try refresh token first, then UAA, then browser if needed
      authLogger.debug('[refreshTokensForTests] Attempting to get token via auth-broker (will try refresh token, UAA, then browser if needed)');
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

        if (process.env.DEBUG_TESTS === 'true') {
          authLogger.info('[refreshTokensForTests] ✓ Tokens refreshed successfully');
          authLogger.debug(`[refreshTokensForTests] URL: ${connConfig.serviceUrl}`);
          authLogger.debug(`[refreshTokensForTests] Token length: ${token.length}`);
          authLogger.debug(`[refreshTokensForTests] Has refresh token: ${!!authConfig?.refreshToken}`);
        }

        // Persist session env file explicitly (helps when session store is non-persistent)
        try {
          const sessionsPaths = getPlatformPaths(customPath, 'sessions');
          const targetSessionsDir = sessionsPaths[0];
          if (targetSessionsDir) {
            fs.mkdirSync(targetSessionsDir, { recursive: true });
            const sessionEnvPath = path.join(targetSessionsDir, `${destination}.env`);
            const lines = [
              `SAP_URL=${connConfig.serviceUrl}`,
              `SAP_JWT_TOKEN=${connConfig.authorizationToken || token}`,
              authConfig?.refreshToken ? `SAP_REFRESH_TOKEN=${authConfig.refreshToken}` : null,
              authConfig?.uaaUrl ? `SAP_UAA_URL=${authConfig.uaaUrl}` : null,
              authConfig?.uaaClientId ? `SAP_UAA_CLIENT_ID=${authConfig.uaaClientId}` : null,
              authConfig?.uaaClientSecret ? `SAP_UAA_CLIENT_SECRET=${authConfig.uaaClientSecret}` : null,
              connConfig.sapClient ? `SAP_CLIENT=${connConfig.sapClient}` : (process.env.SAP_CLIENT ? `SAP_CLIENT=${process.env.SAP_CLIENT}` : null),
              connConfig.language ? `SAP_LANGUAGE=${connConfig.language}` : (process.env.SAP_LANGUAGE ? `SAP_LANGUAGE=${process.env.SAP_LANGUAGE}` : null),
            ].filter(Boolean) as string[];
            fs.writeFileSync(sessionEnvPath, lines.join('\n'), { encoding: 'utf8' });
            authLogger.debug(`[refreshTokensForTests] Session env written to ${sessionEnvPath}`);
          }
        } catch (persistErr: any) {
          authLogger.warn(`[refreshTokensForTests] Failed to persist session env: ${persistErr?.message || String(persistErr)}`);
        }
      }
    } catch (error: any) {
      // If token refresh fails, log but don't fail tests
      // Tests will use existing .env tokens (may fail if expired, but that's expected)
      authLogger.warn(`[refreshTokensForTests] Failed to refresh tokens: ${error?.message || String(error)}`);
      authLogger.warn('[refreshTokensForTests] Tests will use existing .env tokens (may fail if expired)');
    }
  } catch (error: any) {
    // If AuthBroker setup fails, log but don't fail tests
    authLogger.warn(`[refreshTokensForTests] Failed to setup AuthBroker: ${error?.message || String(error)}`);
    authLogger.warn('[refreshTokensForTests] Tests will use existing .env tokens');
  }
}
