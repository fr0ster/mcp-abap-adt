import { AsyncLocalStorage } from 'node:async_hooks';
import * as crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import {
  createAbapConnection,
  getTimeout,
  getTimeoutConfig,
  type SapConfig,
  sapConfigSignature,
} from '@mcp-abap-adt/connection';
import type { IAbapConnection, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { AxiosError, type AxiosResponse } from 'axios';
import {
  notifyConnectionResetListeners,
  registerConnectionResetHook,
} from './connectionEvents';
import { connectionManagerLogger, logger } from './logger';
import { loggerAdapter } from './loggerAdapter';

// Initialize connection variables before exports to avoid circular dependency issues
// Variables are initialized immediately to avoid TDZ (Temporal Dead Zone) issues
let overrideConfig: SapConfig | undefined;
let overrideConnection: IAbapConnection | undefined;
let cachedConnection: IAbapConnection | undefined;
let cachedConfigSignature: string | undefined;

// Connection cache per session + config hash
interface ConnectionCacheEntry {
  connection: IAbapConnection;
  configSignature: string;
  sessionId: string;
  lastUsed: Date;
}

const connectionCache = new Map<string, ConnectionCacheEntry>();

// AsyncLocalStorage for storing session context
export const sessionContext = new AsyncLocalStorage<{
  sessionId?: string;
  sapConfig?: SapConfig;
  destination?: string; // Store destination for AuthBroker-based token refresh
}>();

// Fixed session ID for server connection (allows session persistence across requests)
const _SERVER_SESSION_ID = 'mcp-abap-adt-session';

// Global AuthBroker registry for destination-based authentication
// This allows JwtAbapConnection to access AuthBroker instances for token refresh
// Store in global object so it can be accessed from @mcp-abap-adt/connection package
declare global {
  // eslint-disable-next-line no-var
  var __mcpAbapAdtAuthBrokerRegistry: Map<string, any> | undefined;
}

if (!global.__mcpAbapAdtAuthBrokerRegistry) {
  global.__mcpAbapAdtAuthBrokerRegistry = new Map<string, any>();
}

const authBrokerRegistry = global.__mcpAbapAdtAuthBrokerRegistry;

/**
 * Register AuthBroker instance for a destination
 * This allows JwtAbapConnection to use AuthBroker for token refresh when destination is set
 */
export function registerAuthBroker(destination: string, authBroker: any): void {
  authBrokerRegistry.set(destination, authBroker);
  connectionManagerLogger?.debug(
    `[DEBUG] registerAuthBroker - Registered AuthBroker for destination "${destination}"`,
  );
}

/**
 * Get AuthBroker instance for a destination
 * Returns undefined if not registered
 * This function can be called from @mcp-abap-adt/connection package via global registry
 */
export function getAuthBroker(destination: string): any | undefined {
  return authBrokerRegistry.get(destination);
}

export { McpError, ErrorCode, getTimeout, getTimeoutConfig, logger };
export type { AxiosResponse };

/**
 * Encodes SAP object names for use in URLs.
 * Mirrors @mcp-abap-adt/adt-clients internal util but avoids unstable exports.
 */
export function encodeSapObjectName(objectName: string): string {
  return encodeURIComponent(objectName);
}

export function return_response(response: IAdtResponse | AxiosResponse) {
  return {
    isError: false,
    content: [
      {
        type: 'text',
        text: response.data,
      },
    ],
  };
}
/**
 * Safely serializes an error object, avoiding circular references
 */
function _safeStringifyError(error: any): string {
  if (error instanceof AxiosError) {
    // For Axios errors, extract safe information
    const safeError: any = {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
    };

    // Safely extract response data
    if (error.response?.data) {
      if (typeof error.response.data === 'string') {
        safeError.responseData = error.response.data.substring(0, 1000); // Limit length
      } else {
        try {
          // Try to stringify, but catch circular reference errors
          safeError.responseData = JSON.stringify(error.response.data, null, 2);
        } catch (_e) {
          safeError.responseData = String(error.response.data).substring(
            0,
            1000,
          );
        }
      }
    }

    try {
      return JSON.stringify(safeError, null, 2);
    } catch (_e) {
      return `AxiosError: ${error.message} (Status: ${error.response?.status})`;
    }
  } else if (error instanceof Error) {
    return error.message;
  } else {
    try {
      return JSON.stringify(error, null, 2);
    } catch (_e) {
      return String(error);
    }
  }
}

/**
 * Safely logs an error without circular reference issues
 */
export function logErrorSafely(
  logger: any,
  operationName: string,
  error: any,
): void {
  if (!logger?.error) {
    return;
  }

  let errorMessage = `[ERROR] ${operationName} failed`;
  const errorDetails: any = {};

  if (error instanceof AxiosError && error.response) {
    errorMessage += ` - Status: ${error.response.status}`;
    if (error.response.statusText) {
      errorMessage += ` - StatusText: ${error.response.statusText}`;
    }
    errorDetails.status = error.response.status;
    errorDetails.statusText = error.response.statusText;
    errorDetails.responseHeaders = error.response.headers;

    // Safely extract response data
    if (error.response.data) {
      if (typeof error.response.data === 'string') {
        errorDetails.responseData = error.response.data.substring(0, 500);
      } else {
        try {
          errorDetails.responseData = JSON.stringify(
            error.response.data,
          ).substring(0, 500);
        } catch (_e) {
          errorDetails.responseData = String(error.response.data).substring(
            0,
            500,
          );
        }
      }
    }
  } else if (error instanceof Error) {
    errorMessage += `: ${error.message}`;
    errorDetails.message = error.message;
    errorDetails.stack = error.stack;
  } else {
    errorMessage += `: ${String(error)}`;
    errorDetails.rawError = String(error);
  }

  logger?.error(errorMessage, errorDetails);
}

export function return_error(error: any) {
  // Safely extract error message to avoid circular reference issues
  // Always extract only safe properties, never serialize the entire error object
  let errorText: string;

  try {
    if (error instanceof AxiosError) {
      // Check for DNS/network errors first
      const errorCode = (error as any).code;
      const errorMessage = error.message || '';

      // Handle DNS resolution errors (common on Windows)
      if (
        errorCode === 'ENOTFOUND' ||
        errorMessage.includes('getaddrinfo ENOTFOUND')
      ) {
        const hostnameMatch =
          errorMessage.match(/ENOTFOUND\s+([^\s]+)/) ||
          errorMessage.match(/getaddrinfo ENOTFOUND\s+([^\s]+)/);
        const hostname = hostnameMatch ? hostnameMatch[1] : 'unknown host';

        errorText =
          `DNS resolution failed: Cannot resolve hostname "${hostname}". ` +
          `Please check:\n` +
          `1. Your network connection\n` +
          `2. DNS settings (try: nslookup ${hostname})\n` +
          `3. VPN connection (if required)\n` +
          `4. Firewall settings\n` +
          `5. The SAP_URL in your .env file is correct\n` +
          `\nOriginal error: ${errorMessage}`;
      } else if (
        errorCode === 'ECONNREFUSED' ||
        errorMessage.includes('ECONNREFUSED')
      ) {
        errorText =
          `Connection refused: The server is not accepting connections. ` +
          `Please check if the SAP system is accessible and the URL is correct.\n` +
          `\nOriginal error: ${errorMessage}`;
      } else if (
        errorCode === 'ETIMEDOUT' ||
        errorMessage.includes('ETIMEDOUT')
      ) {
        errorText =
          `Connection timeout: The request took too long to complete. ` +
          `Please check your network connection and try again.\n` +
          `\nOriginal error: ${errorMessage}`;
      } else if (error.response?.data) {
        // For Axios errors with response data, safely extract response data
        if (typeof error.response.data === 'string') {
          errorText = error.response.data.substring(0, 2000); // Limit length
        } else {
          try {
            // Use a replacer function to avoid circular references
            const seen = new WeakSet();
            errorText = JSON.stringify(error.response.data, (key, value) => {
              if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                  return '[Circular]';
                }
                seen.add(value);
              }
              // Remove problematic HTTP objects
              if (
                key === 'socket' ||
                key === '_httpMessage' ||
                key === 'res' ||
                key === 'req'
              ) {
                return '[HTTP Object]';
              }
              return value;
            }).substring(0, 2000);
          } catch (_e) {
            errorText = `HTTP ${error.response.status}: ${error.response.statusText || 'Error'}`;
          }
        }
      } else {
        errorText =
          errorMessage || `HTTP ${error.response?.status || 'Unknown error'}`;
      }
    } else if (error instanceof Error) {
      // Check for DNS errors in regular Error objects too
      const errorMessage = error.message || '';
      if (
        errorMessage.includes('getaddrinfo ENOTFOUND') ||
        errorMessage.includes('ENOTFOUND')
      ) {
        const hostnameMatch =
          errorMessage.match(/ENOTFOUND\s+([^\s]+)/) ||
          errorMessage.match(/getaddrinfo ENOTFOUND\s+([^\s]+)/);
        const hostname = hostnameMatch ? hostnameMatch[1] : 'unknown host';

        errorText =
          `DNS resolution failed: Cannot resolve hostname "${hostname}". ` +
          `Please check:\n` +
          `1. Your network connection\n` +
          `2. DNS settings (try: nslookup ${hostname})\n` +
          `3. VPN connection (if required)\n` +
          `4. Firewall settings\n` +
          `5. The SAP_URL in your .env file is correct\n` +
          `\nOriginal error: ${errorMessage}`;
      } else {
        errorText = errorMessage;
      }
    } else if (typeof error === 'string') {
      errorText = error;
    } else {
      // For other types, try safe stringify
      try {
        const seen = new WeakSet();
        errorText = JSON.stringify(error, (key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
              return '[Circular]';
            }
            seen.add(value);
          }
          if (
            key === 'socket' ||
            key === '_httpMessage' ||
            key === 'res' ||
            key === 'req'
          ) {
            return '[HTTP Object]';
          }
          return value;
        }).substring(0, 2000);
      } catch (_e) {
        errorText = String(error).substring(0, 2000);
      }
    }
  } catch (_e) {
    // Fallback if all else fails
    errorText = 'An error occurred (failed to serialize error details)';
  }

  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Error: ${errorText}`,
      },
    ],
  };
}

/**
 * Generate cache key for connection based on sessionId, config signature, and destination
 * This ensures each client session with different SAP config or destination gets its own connection
 *
 * Example scenarios:
 * - 4 clients, each with 2 destinations = up to 8 different connections
 * - Each combination of (sessionId, config, destination) gets its own isolated connection
 */
function generateConnectionCacheKey(
  sessionId: string,
  configSignature: string,
  destination?: string,
): string {
  const hash = crypto.createHash('sha256');
  hash.update(sessionId);
  hash.update(configSignature);
  // Include destination in cache key to ensure different destinations get different connections
  // This is critical for multi-tenant scenarios where same sessionId might use different destinations
  hash.update(destination || '');
  return hash.digest('hex');
}

/**
 * Clean up old connections from cache (older than 1 hour)
 */
function cleanupConnectionCache() {
  const now = new Date();
  const maxAge = 60 * 60 * 1000; // 1 hour

  for (const [key, entry] of connectionCache.entries()) {
    const age = now.getTime() - entry.lastUsed.getTime();
    if (age > maxAge) {
      connectionManagerLogger?.debug(
        `[DEBUG] Cleaning up old connection cache entry: ${key.substring(0, 16)}...`,
      );
      connectionCache.delete(key);
    }
  }
}

/**
 * Get or create connection for a specific session and config
 */
function getConnectionForSession(
  sessionId: string,
  config: SapConfig,
  destination?: string,
): IAbapConnection {
  const configSignature = sapConfigSignature(config);
  const cacheKey = generateConnectionCacheKey(
    sessionId,
    configSignature,
    destination,
  );

  // Clean up old entries periodically
  if (connectionCache.size > 100) {
    cleanupConnectionCache();
  }

  let entry = connectionCache.get(cacheKey);

  if (!entry || entry.configSignature !== configSignature) {
    connectionManagerLogger?.debug(
      `[DEBUG] getManagedConnection - Creating new connection for session ${sessionId.substring(0, 8)}... (cache key: ${cacheKey.substring(0, 16)}...)`,
    );

    // Dispose old connection if exists
    if (entry) {
      /* cleanup */
    }

    // Create new connection with unique session ID per client session
    const connectionSessionId = `mcp-abap-adt-session-${sessionId}`;

    // Get tokenRefresher from AuthBroker if destination is provided (for JWT connections)
    let tokenRefresher: any;
    if (destination && config.authType === 'jwt') {
      const authBroker = getAuthBroker(destination);
      if (authBroker?.createTokenRefresher) {
        tokenRefresher = authBroker.createTokenRefresher(destination);
        connectionManagerLogger?.debug(
          `[DEBUG] Created tokenRefresher for destination "${destination}"`,
        );
      }
    }

    // Create connection with optional tokenRefresher for automatic token refresh
    const connection = createAbapConnection(
      config,
      loggerAdapter,
      connectionSessionId,
      tokenRefresher,
    );

    // Don't call enableStatefulSession during module import - it may trigger connection attempts
    // Session ID is already set via createAbapConnection() constructor
    // enableStatefulSession() will be called lazily when first request is made (if needed)

    // Don't call connect() here - it will be called lazily on first request
    // This prevents unnecessary connection attempts during module import (e.g., in Jest tests)
    // The retry logic in makeAdtRequest will handle connection establishment automatically

    entry = {
      connection,
      configSignature,
      sessionId,
      lastUsed: new Date(),
    };

    connectionCache.set(cacheKey, entry);
  } else {
    entry.lastUsed = new Date();
    connectionManagerLogger?.debug(
      `[DEBUG] getManagedConnection - Reusing cached connection for session ${sessionId.substring(0, 8)}...`,
    );
  }

  return entry.connection;
}

export function getManagedConnection(): IAbapConnection {
  // If override connection is set, use it (for backward compatibility)
  if (overrideConnection) {
    return overrideConnection;
  }

  // Try to get session context from AsyncLocalStorage
  const context = sessionContext.getStore();

  if (context?.sessionId && context?.sapConfig) {
    // Use session-specific connection with destination for AuthBroker-based token refresh
    return getConnectionForSession(
      context.sessionId,
      context.sapConfig,
      context.destination,
    );
  }

  // Config must be provided via overrideConfig (from connection provider/broker)
  // No fallback to getConfig() - incompatible with broker-based architecture
  if (!overrideConfig) {
    throw new Error(
      'Connection config must be provided via overrideConfig or session context. In v2 architecture, config comes from connection provider (broker), not from environment variables.',
    );
  }
  const config = overrideConfig;

  // Helper function for Windows-compatible logging
  // Only logs when DEBUG_CONNECTORS, DEBUG_TESTS, or DEBUG_ADT_TESTS is enabled
  const debugLog = (message: string): void => {
    const debugEnabled =
      process.env.DEBUG_CONNECTORS === 'true' ||
      process.env.DEBUG_TESTS === 'true' ||
      process.env.DEBUG_ADT_TESTS === 'true';

    if (!debugEnabled) {
      return; // Suppress debug logs when not in debug mode
    }

    // Try stderr first
    try {
      process.stderr.write(message);
    } catch (_e) {
      // Fallback to console.error for Windows
      console.error(message.trim());
    }
    // Also try to write to a debug file on Windows
    if (process.platform === 'win32') {
      try {
        const fs = require('node:fs');
        const path = require('node:path');
        const debugFile = path.join(process.cwd(), 'mcp-debug.log');
        fs.appendFileSync(
          debugFile,
          `${new Date().toISOString()} ${message}`,
          'utf8',
        );
      } catch (_e) {
        // Ignore file write errors
      }
    }
  };

  // Debug logging - verify URL is clean before creating connection (only in debug mode)
  // NOTE: This debug logging should NOT trigger connection attempts
  // Only log if explicitly enabled via DEBUG_CONNECTORS, DEBUG_TESTS, or DEBUG_ADT_TESTS
  if (config.url) {
    const _urlHex = Buffer.from(config.url, 'utf8').toString('hex');
    debugLog(
      `[MCP-UTILS] Creating connection with URL: "${config.url}" (length: ${config.url.length})\n`,
    );
  } else {
    debugLog(`[MCP-UTILS] ✗ ERROR: config.url is missing!\n`);
  }

  const signature = sapConfigSignature(config);

  if (!cachedConnection || cachedConfigSignature !== signature) {
    connectionManagerLogger?.debug(
      `[DEBUG] getManagedConnection - Creating new connection (cached: ${!!cachedConnection}, signature changed: ${cachedConfigSignature !== signature})`,
    );
    if (cachedConnection) {
      connectionManagerLogger?.debug(
        `[DEBUG] getManagedConnection - Old signature: ${cachedConfigSignature?.substring(0, 100)}...`,
      );
      connectionManagerLogger?.debug(
        `[DEBUG] getManagedConnection - New signature: ${signature.substring(0, 100)}...`,
      );
    }

    // Log refresh token availability for debugging
    const hasRefreshToken = !!config.refreshToken?.trim();
    const hasUaaUrl = !!config.uaaUrl;
    const hasUaaClientId = !!config.uaaClientId;
    const hasUaaClientSecret = !!config.uaaClientSecret;
    connectionManagerLogger?.debug(
      `[DEBUG] getManagedConnection - Refresh token config:`,
      {
        hasRefreshToken,
        hasUaaUrl,
        hasUaaClientId,
        hasUaaClientSecret,
        canRefresh:
          hasRefreshToken && hasUaaUrl && hasUaaClientId && hasUaaClientSecret,
        configObjectId: (config as any).__debugId || 'no-id',
      },
    );

    /* cleanup */

    // Generate unique session ID for fallback connections to prevent session sharing
    // When sessionContext is not available, each connection should have its own isolated session
    // This prevents cookies/CSRF tokens from being shared between different connections
    const fallbackSessionId = `mcp-abap-adt-fallback-${randomUUID()}`;
    connectionManagerLogger?.debug(
      `[DEBUG] getManagedConnection - Creating fallback connection with unique session ID: ${fallbackSessionId.substring(0, 32)}...`,
    );

    cachedConnection = createAbapConnection(
      config,
      loggerAdapter,
      fallbackSessionId,
    );

    // Verify connection has access to refresh token
    const connectionWithRefresh = cachedConnection as any;
    if (
      connectionWithRefresh.getConfig &&
      connectionWithRefresh.canRefreshToken
    ) {
      const connectionConfig = connectionWithRefresh.getConfig();
      const canRefresh = connectionWithRefresh.canRefreshToken();
      connectionManagerLogger?.debug(
        `[DEBUG] getManagedConnection - Connection created, refresh check:`,
        {
          canRefresh,
          connectionHasRefreshToken: !!connectionConfig?.refreshToken,
          connectionHasUaaUrl: !!connectionConfig?.uaaUrl,
          configMatches:
            connectionConfig === config
              ? 'same object ✓'
              : 'different object ✗',
        },
      );
    }
    cachedConfigSignature = signature;

    // Don't call enableStatefulSession during module import - it may trigger connection attempts
    // Session ID is already set via createAbapConnection() constructor
    // enableStatefulSession() will be called lazily when first request is made (if needed)

    // Don't call connect() here - it will be called lazily on first request
    // This prevents unnecessary connection attempts during module import (e.g., in Jest tests)
    // The retry logic in makeAdtRequest will handle connection establishment automatically
  } else {
    connectionManagerLogger?.debug(
      `[DEBUG] getManagedConnection - Reusing cached connection (signature matches)`,
    );
  }

  return cachedConnection;
}

/**
 * Remove connection from cache for a specific session
 * Called when session is closed
 *
 * If destination is provided, removes only the connection for that specific destination.
 * If destination is not provided, removes all connections for the session (all destinations).
 */
export function removeConnectionForSession(
  sessionId: string,
  config?: SapConfig,
  destination?: string,
) {
  if (config) {
    const configSignature = sapConfigSignature(config);
    const cacheKey = generateConnectionCacheKey(
      sessionId,
      configSignature,
      destination,
    );
    const entry = connectionCache.get(cacheKey);
    if (entry) {
      connectionManagerLogger?.debug(
        `[DEBUG] Removing connection cache entry for session ${sessionId.substring(0, 8)}... (destination: ${destination || 'none'})`,
      );
      /* cleanup */
      connectionCache.delete(cacheKey);
    }
  } else {
    // Remove all entries for this sessionId (all destinations and configs)
    for (const [key, entry] of connectionCache.entries()) {
      if (entry.sessionId === sessionId) {
        connectionManagerLogger?.debug(
          `[DEBUG] Removing connection cache entry for session ${sessionId.substring(0, 8)}...`,
        );
        /* cleanup */
        connectionCache.delete(key);
      }
    }
  }
}

/**
 * Restore session state in connection
 * Note: Session state management (getSessionState/setSessionState) was removed in connection 0.2.0
 * Session state persistence is now handled by @mcp-abap-adt/auth-broker package
 * This function now only sets session type to stateful and session ID
 */
export async function restoreSessionInConnection(
  connection: IAbapConnection,
  sessionId: string,
  _sessionState: {
    cookies?: string | null;
    csrf_token?: string | null;
    cookie_store?: Record<string, string>;
  },
): Promise<void> {
  // Cast to access internal methods (not in interface but available in implementation)
  const connectionWithStateful = connection as any;

  try {
    // Set session ID first (if not already set via constructor)
    if (connectionWithStateful.setSessionId) {
      connectionWithStateful.setSessionId(sessionId);
    }
    // Enable stateful session mode (adds x-sap-adt-sessiontype: stateful header)
    connection.setSessionType('stateful');
  } catch (error: any) {
    logger?.warn('Failed to restore session in connection', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function setConfigOverride(override?: SapConfig) {
  connectionManagerLogger?.debug(
    `[DEBUG] setConfigOverride - Setting config override`,
    {
      hasOverride: !!override,
      overrideHasUrl: !!override?.url,
    },
  );
  overrideConfig = override;
  /* cleanup */
  overrideConnection = override
    ? createAbapConnection(override, loggerAdapter, undefined)
    : undefined;

  // Reset shared connection so that it will be re-created lazily with fresh config
  /* cleanup */
  cachedConnection = undefined;
  cachedConfigSignature = undefined;
  notifyConnectionResetListeners();
}

export function setConnectionOverride(connection?: IAbapConnection) {
  connectionManagerLogger?.debug(
    `[DEBUG] setConnectionOverride - Setting connection override`,
    {
      hasOverride: !!connection,
      hadPreviousOverride: !!overrideConnection,
    },
  );
  // Use a local variable to avoid TDZ issues
  const currentOverride = overrideConnection;
  if (currentOverride) {
    /* cleanup */
  }
  // Assign after reading to avoid TDZ
  overrideConnection = connection;
  overrideConfig = undefined;

  const _currentCached = cachedConnection;
  /* cleanup */
  cachedConnection = undefined;
  cachedConfigSignature = undefined;
  notifyConnectionResetListeners();
}

export function cleanup() {
  connectionManagerLogger?.debug(
    `[DEBUG] cleanup - Cleaning up all connections`,
    {
      hadOverrideConnection: !!overrideConnection,
      hadCachedConnection: !!cachedConnection,
    },
  );
  /* cleanup */
  /* cleanup */
  overrideConnection = undefined;
  overrideConfig = undefined;
  cachedConnection = undefined;
  cachedConfigSignature = undefined;
  notifyConnectionResetListeners();
}

/**
 * Invalidate cached connection to force recreation with updated config
 * This is useful when config is updated directly (e.g., token refresh in JwtAbapConnection)
 * The connection will be recreated on next getManagedConnection() call with updated signature
 */
export function invalidateConnectionCache() {
  connectionManagerLogger?.debug(
    `[DEBUG] invalidateConnectionCache - Invalidating connection cache`,
    {
      hadCachedConnection: !!cachedConnection,
      hadOverrideConnection: !!overrideConnection,
    },
  );
  /* cleanup */
  cachedConnection = undefined;
  cachedConfigSignature = undefined;
  // Also invalidate override connection if it exists
  if (overrideConnection) {
    /* cleanup */
    overrideConnection = undefined;
  }
  notifyConnectionResetListeners();
}

// Register hook to invalidate connection cache when connection is reset
// This ensures that when token is refreshed in JwtAbapConnection, the cache is invalidated
registerConnectionResetHook(() => {
  // When connection is reset (e.g., after token refresh), invalidate cache
  // so that next getManagedConnection() will recreate connection with updated config
  connectionManagerLogger?.debug(
    `[DEBUG] Connection reset hook - Invalidating cache due to connection reset`,
  );
  cachedConnection = undefined;
  cachedConfigSignature = undefined;
});

export async function getBaseUrl() {
  return getManagedConnection().getBaseUrl();
}

/**
 * Makes an ADT request with specified timeout
 * @param url Request URL
 * @param method HTTP method
 * @param timeoutType Timeout type ('default', 'csrf', 'long') or custom number in ms
 * @param data Optional request data
 * @param params Optional request parameters
 * @param headers Optional custom headers
 * @returns Promise with the response
 */
export async function makeAdtRequestWithTimeout(
  connection: IAbapConnection,
  url: string,
  method: string,
  timeoutType: 'default' | 'csrf' | 'long' | number = 'default',
  data?: any,
  params?: any,
  headers?: Record<string, string>,
): Promise<AxiosResponse> {
  const timeout = getTimeout(timeoutType);
  return makeAdtRequest(
    connection,
    url,
    method,
    timeout,
    data,
    params,
    headers,
  );
}

/**
 * Fetches node structure from SAP ADT repository
 * @deprecated Use getAdtClient().fetchNodeStructure() instead
 */
export async function fetchNodeStructure(
  _connection: IAbapConnection,
  _parentName: string,
  _parentTechName: string,
  _parentType: string,
  _nodeKey: string,
  _withShortDescriptions: boolean = true,
): Promise<AxiosResponse> {
  // TODO: Add fetchNodeStructure to AdtClient
  throw new Error('fetchNodeStructure not implemented in AdtClient yet');
  // const { getAdtClient } = await import('./clients.js');
  // return getAdtClient().fetchNodeStructure(parentName, parentTechName, parentType, nodeKey, withShortDescriptions);
}

export async function makeAdtRequest(
  connection: IAbapConnection,
  url: string,
  method: string,
  timeout: number,
  data?: any,
  params?: any,
  headers?: Record<string, string>,
): Promise<AxiosResponse> {
  return connection.makeAdtRequest({
    url,
    method,
    timeout,
    data,
    params,
    headers,
  }) as Promise<AxiosResponse>;
}

/**
 * Get system information from SAP ADT (for cloud systems)
 * @deprecated Use getAdtClient().getSystemInformation() instead
 */
export async function getSystemInformation(): Promise<{
  systemID?: string;
  userName?: string;
} | null> {
  // TODO: Add getSystemInformation to AdtClient
  throw new Error('getSystemInformation not implemented in AdtClient yet');
  // const { getAdtClient } = await import('./clients.js');
  // return getAdtClient().getSystemInformation();
}

/**
 * Check if current connection is cloud (JWT auth) or on-premise (basic auth)
 * In v2 architecture, config must come from connection provider/broker, not from getConfig()
 */
export function isCloudConnection(config?: SapConfig): boolean {
  try {
    // If config provided as parameter, use it
    if (config) {
      return config.authType === 'jwt';
    }

    // Try to get config from session context (v2 architecture)
    const context = sessionContext.getStore();
    if (context?.sapConfig) {
      return context.sapConfig.authType === 'jwt';
    }

    // Try to get config from overrideConfig (set by connection provider)
    if (overrideConfig) {
      return overrideConfig.authType === 'jwt';
    }

    // Try to get config from cached connection
    if (cachedConnection) {
      const connectionConfig = (cachedConnection as any).getConfig?.();
      if (connectionConfig) {
        return connectionConfig.authType === 'jwt';
      }
    }

    // If no config available, cannot determine - return false for safety
    return false;
  } catch {
    return false;
  }
}

/**
 * Parse validation response from ADT
 * Checks for CHECK_RESULT=X (success) or SEVERITY=ERROR with message
 * @param response - IAdtResponse or AxiosResponse from validation endpoint
 * @returns Parsed validation result with valid, severity, message, exists fields
 */
export function parseValidationResponse(
  response: IAdtResponse | AxiosResponse,
): {
  valid: boolean;
  severity?: string;
  message?: string;
  longText?: string;
  exists?: boolean;
} {
  try {
    const { XMLParser } = require('fast-xml-parser');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    const result = parser.parse(response.data);

    // Check for exception format (<exc:exception>)
    const exception = result['exc:exception'];
    if (exception) {
      const message = exception.message || '';
      const localizedMessage = exception.localizedMessage || message;
      const msgText = localizedMessage || message;
      const msgLower = msgText.toLowerCase();

      // Check exception type - ExceptionResourceAlreadyExists means object exists
      const exceptionType = exception.type || '';
      const isResourceAlreadyExists =
        exceptionType === 'ExceptionResourceAlreadyExists' ||
        exceptionType.includes('ResourceAlreadyExists') ||
        exceptionType.includes('AlreadyExists');

      // InvalidClifName with "already exists" message also means object exists
      const isInvalidClifName = exceptionType === 'InvalidClifName';

      // Check if message indicates object already exists
      const exists =
        isResourceAlreadyExists ||
        (isInvalidClifName && msgLower.includes('already exists')) ||
        msgLower.includes('already exists') ||
        (msgLower.includes('exist') &&
          (msgLower.includes('table') ||
            msgLower.includes('database') ||
            msgLower.includes('resource') ||
            msgLower.includes('interface') ||
            msgLower.includes('class')));

      return {
        valid: false,
        severity: 'ERROR',
        message: msgText,
        exists: exists ? true : undefined,
      };
    }

    // Check for standard format (<asx:abap><asx:values><DATA>)
    const data = result['asx:abap']?.['asx:values']?.DATA;
    if (!data) {
      // No data means validation passed
      return { valid: true };
    }

    // Check for CHECK_RESULT=X (success)
    if (data.CHECK_RESULT === 'X') {
      return { valid: true };
    }

    // Check for SEVERITY (error/warning)
    const severity = data.SEVERITY;
    const shortText = data.SHORT_TEXT || '';
    const longText = data.LONG_TEXT || '';

    // Check if message indicates object already exists
    const msgLower = shortText.toLowerCase();
    const exists =
      msgLower.includes('already exists') ||
      msgLower.includes('does already exist') ||
      (msgLower.includes('exist') &&
        (msgLower.includes('resource') ||
          msgLower.includes('definition') ||
          msgLower.includes('object')));

    return {
      valid: severity !== 'ERROR',
      severity: severity,
      message: shortText,
      longText: longText,
      exists: exists || undefined,
    };
  } catch (_error) {
    // If parsing fails, check HTTP status
    if (response.status === 200) {
      return { valid: true };
    }
    // If parsing fails and status is not 200, try to extract error message from response.data
    let errorMessage = `Validation failed with status ${response.status}`;

    // Try to extract error details from response data (plain text or XML)
    if (response.data) {
      const dataStr =
        typeof response.data === 'string'
          ? response.data
          : String(response.data);
      // Try to extract meaningful error from plain text or unparsed XML
      if (dataStr.length > 0 && dataStr.length < 1000) {
        // If it's short text, use it directly (might be plain error message)
        errorMessage = dataStr.trim();
      } else if (dataStr.includes('<message>')) {
        // Try simple regex extraction for <message> tag
        const match = dataStr.match(/<message[^>]*>([^<]+)<\/message>/i);
        if (match?.[1]) {
          errorMessage = match[1].trim();
        }
      }
    }

    return {
      valid: false,
      severity: 'ERROR',
      message: errorMessage,
    };
  }
}

/**
 * Check if error message indicates object was already checked
 * Used to handle "has been checked" / "was checked" messages as non-critical
 * @param error - Error object or error message string
 * @returns true if error indicates object was already checked
 */
export function isAlreadyCheckedError(error: any): boolean {
  const errorMessage = error?.message || error?.text || String(error || '');
  const msgLower = errorMessage.toLowerCase();
  return (
    msgLower.includes('has been checked') ||
    msgLower.includes('was checked') ||
    msgLower.includes('already checked')
  );
}

/**
 * Check if error message indicates object already exists
 * Used to handle validation errors for existing objects
 * @param error - Error object or error message string
 * @returns true if error indicates object already exists
 */
export function isAlreadyExistsError(error: any): boolean {
  const errorMessage = error?.message || error?.text || String(error || '');
  const responseData =
    typeof error?.response?.data === 'string'
      ? error.response.data
      : error?.response?.data
        ? JSON.stringify(error.response.data)
        : '';
  const msgLower = `${errorMessage} ${responseData}`.toLowerCase();
  return (
    msgLower.includes('already exists') ||
    msgLower.includes('does already exist') ||
    msgLower.includes('resource already exists') ||
    msgLower.includes('object already exists')
  );
}

/**
 * Safely handle check operation - ignores "already checked" errors
 * Wraps check operation and handles "has been checked" as non-critical
 * @param checkOperation - Promise that performs check operation
 * @param objectName - Name of object being checked (for logging)
 * @param logger - Optional logger function for debug messages
 * @returns Result of check operation or throws if real error
 */
export async function safeCheckOperation<T>(
  checkOperation: () => Promise<T>,
  objectName: string,
  logger?: { debug?: (message: string, data?: any) => void },
): Promise<T> {
  try {
    return await checkOperation();
  } catch (checkError: any) {
    if (isAlreadyCheckedError(checkError)) {
      // Object was already checked - this is OK, continue
      if (logger?.debug) {
        logger?.debug(
          `${objectName} was already checked - this is OK, continuing`,
        );
      }
      // Return a mock success response or rethrow with handled flag
      // For now, we'll rethrow but mark it as handled
      const handledError = new Error(
        `Object ${objectName} was already checked`,
      );
      (handledError as any).isAlreadyChecked = true;
      throw handledError;
    }
    // Real check error - rethrow
    throw checkError;
  }
}
/**
 * Display help message
 */
export function showHelp(): void {
  const help = `
MCP ABAP ADT Server - SAP ABAP Development Tools MCP Integration

USAGE:
  mcp-abap-adt [options]

DESCRIPTION:
  MCP server for interacting with SAP ABAP systems via ADT (ABAP Development Tools).
  Supports multiple transport modes: HTTP (default), stdio, and SSE.

TRANSPORT MODES:
  Default: stdio (for MCP clients like Cline, Cursor, Claude Desktop)
  HTTP:    --transport=http (for web interfaces, receives config via HTTP headers)
  SSE:     --transport=sse

OPTIONS:
  --help                           Show this help message
  --config=<path>                  Path to YAML configuration file
                                   If file doesn't exist, generates a template and exits
                                   Command-line arguments override YAML values
                                   Example: --config=config.yaml

YAML CONFIGURATION:
  Instead of passing many command-line arguments, you can use a YAML config file:

    mcp-abap-adt --config=config.yaml

  If the file doesn't exist, a template will be generated automatically and the command will exit.
  Edit the template to configure your server settings, then run the command again.

  The YAML file is validated on load - invalid configurations will cause the command to exit with an error.

  Command-line arguments always override YAML values for flexibility.

  See docs/configuration/YAML_CONFIG.md for detailed documentation.

ENVIRONMENT FILE:
  --env=<name>                     Env destination name (resolved to sessions/<name>.env)
  --env <name>                     Alternative syntax for --env
  --env-path=<path|file>           Explicit .env file path (or relative file name)
  --auth-broker                    Force use of auth-broker (service keys) instead of .env file
                                   Ignores .env file even if present in current directory
                                   By default, .env in current directory is used automatically (if exists)
  --auth-broker-path=<path>        Custom path for auth-broker service keys and sessions
                                   Creates service-keys and sessions subdirectories in this path
                                   Example: --auth-broker-path=~/prj/tmp/
                                   This will use ~/prj/tmp/service-keys and ~/prj/tmp/sessions
  --mcp=<destination>              Default MCP destination name (overrides x-mcp-destination header)
                                   If specified, this destination will be used when x-mcp-destination
                                   header is not provided in the request
                                   Example: --mcp=TRIAL
                                   This allows using auth-broker with stdio and SSE transports
                                   When --mcp is specified, .env file is not loaded automatically
                                   (even if it exists in current directory)

TRANSPORT SELECTION:
  --transport=<type>               Transport type: stdio|http|streamable-http|sse
                                   Default: stdio (for MCP clients)
                                   Shortcuts: --http (same as --transport=http)
                                             --sse (same as --transport=sse)
                                             --stdio (same as --transport=stdio)

HTTP/STREAMABLE-HTTP OPTIONS:
  --http-port=<port>               HTTP server port (default: 3000)
  --http-host=<host>               HTTP server host (default: 127.0.0.1 for local only, use 0.0.0.0 for all interfaces)
                                   Security: When listening on 0.0.0.0, client must provide all connection headers
                                   Server will not use default destination for non-local connections
  --http-json-response             Enable JSON response format
  --http-allowed-origins=<list>    Comma-separated allowed origins for CORS
                                   Example: --http-allowed-origins=http://localhost:3000,https://example.com
  --http-allowed-hosts=<list>      Comma-separated allowed hosts
  --http-enable-dns-protection     Enable DNS rebinding protection

SSE (SERVER-SENT EVENTS) OPTIONS:
  --sse-port=<port>                SSE server port (default: 3001)
  --sse-host=<host>                SSE server host (default: 127.0.0.1 for local only, use 0.0.0.0 for all interfaces)
                                   Security: When listening on 0.0.0.0, client must provide all connection headers
                                   Server will not use default destination for non-local connections
  --sse-allowed-origins=<list>     Comma-separated allowed origins for CORS
                                   Example: --sse-allowed-origins=http://localhost:3000
  --sse-allowed-hosts=<list>       Comma-separated allowed hosts
  --sse-enable-dns-protection     Enable DNS rebinding protection

ENVIRONMENT VARIABLES:
  MCP_ENV_PATH                     Explicit .env file path (same as --env-path)
  MCP_SKIP_ENV_LOAD                Skip automatic .env loading (true|false)
  MCP_SKIP_AUTO_START              Skip automatic server start (true|false)
  MCP_TRANSPORT                    Transport type (stdio|http|sse)
                                   Default: stdio if not specified
  MCP_HTTP_PORT                    Default HTTP port (default: 3000)
  MCP_HTTP_HOST                    Default HTTP host (default: 127.0.0.1 for local only, use 0.0.0.0 for all interfaces)
  MCP_HTTP_ENABLE_JSON_RESPONSE   Enable JSON responses (true|false)
  MCP_HTTP_ALLOWED_ORIGINS         Allowed CORS origins (comma-separated)
  MCP_HTTP_ALLOWED_HOSTS           Allowed hosts (comma-separated)
  MCP_HTTP_ENABLE_DNS_PROTECTION   Enable DNS protection (true|false)
  MCP_SSE_PORT                     Default SSE port (default: 3001)
  MCP_SSE_HOST                     Default SSE host (default: 127.0.0.1 for local only, use 0.0.0.0 for all interfaces)
  MCP_SSE_ALLOWED_ORIGINS          Allowed CORS origins for SSE (comma-separated)
  MCP_SSE_ALLOWED_HOSTS            Allowed hosts for SSE (comma-separated)
  MCP_SSE_ENABLE_DNS_PROTECTION    Enable DNS protection for SSE (true|false)
  AUTH_BROKER_PATH                 Custom paths for service keys and sessions
                                   Unix: colon-separated (e.g., /path1:/path2)
                                   Windows: semicolon-separated (e.g., C:\\path1;C:\\path2)
                                   If not set, uses platform defaults:
                                   Unix: ~/.config/mcp-abap-adt/service-keys
                                   Windows: %USERPROFILE%\\Documents\\mcp-abap-adt\\service-keys
  DEBUG_AUTH_LOG                   Enable debug logging for auth-broker (true|false)
                                   Default: false (only info messages shown)
                                   When true: shows detailed debug messages
  DEBUG_AUTH_BROKER                Alias for DEBUG_AUTH_LOG (true|false)
                                   Same as DEBUG_AUTH_LOG - enables debug logging for auth-broker
                                   When true: automatically sets DEBUG_AUTH_LOG=true
  DEBUG_HTTP_REQUESTS              Enable logging of HTTP requests and MCP calls (true|false)
                                   Default: false
                                   When true: logs all incoming HTTP requests, methods, URLs,
                                   headers (sensitive data redacted), and MCP JSON-RPC calls
                                   Also enabled by DEBUG_CONNECTORS=true
  DEBUG_CONNECTORS                  Enable debug logging for connection layer (true|false)
                                   Default: false
                                   When true: shows HTTP requests, CSRF tokens, cookies,
                                   session management, and connection details
                                   Also enables DEBUG_HTTP_REQUESTS automatically
  DEBUG_HANDLERS                    Enable debug logging for MCP handlers (true|false)
                                   Default: false
                                   When true: shows handler entry/exit, session state,
                                   lock handles, property validation
  DEBUG_CONNECTION_MANAGER          Enable debug logging for connection manager (true|false)
                                   Default: false
                                   When true: shows connection cache operations

SAP CONNECTION (.env file):
  SAP_URL                          SAP system URL (required)
                                   Example: https://your-system.sap.com
  SAP_CLIENT                       SAP client number (required)
                                   Example: 100
  SAP_AUTH_TYPE                    Authentication type: basic|jwt (default: basic)
  SAP_USERNAME                     SAP username (required for basic auth)
  SAP_PASSWORD                     SAP password (required for basic auth)
  SAP_JWT_TOKEN                    JWT token (required for jwt auth)

GENERATING .ENV FROM SERVICE KEY (JWT Authentication):
  To generate .env file from SAP BTP service key JSON file, install the
  connection package globally:

    npm install -g @mcp-abap-adt/connection

  Then use the sap-abap-auth command:

    sap-abap-auth auth -k path/to/service-key.json

  This will create/update .env file with JWT tokens and connection details.

EXAMPLES:
  # Default stdio mode (for MCP clients, requires .env file or --mcp parameter)
  mcp-abap-adt

  # HTTP mode (for web interfaces)
  mcp-abap-adt --transport=http

  # HTTP server on custom port, localhost only (default)
  mcp-abap-adt --transport=http --http-port=8080

  # HTTP server accepting connections from all interfaces (less secure)
  mcp-abap-adt --transport=http --http-host=0.0.0.0 --http-port=8080

  # Use YAML configuration file
  mcp-abap-adt --config=config.yaml

  # Use stdio mode with --mcp parameter (uses auth-broker, skips .env file)
  mcp-abap-adt --mcp=TRIAL

  # Default: uses .env from current directory if exists, otherwise auth-broker
  mcp-abap-adt

  # Force use of auth-broker (service keys), ignore .env file even if exists
  mcp-abap-adt --auth-broker

  # Use custom path for auth-broker (creates service-keys and sessions subdirectories)
  mcp-abap-adt --auth-broker --auth-broker-path=~/prj/tmp/

  # Use SSE transport with --mcp parameter (allows auth-broker with SSE transport)
  mcp-abap-adt --transport=sse --mcp=TRIAL

  # Use env destination from sessions store
  mcp-abap-adt --env=trial

  # Use explicit .env file from custom path
  mcp-abap-adt --env-path=/path/to/my.env

  # Start HTTP server with CORS enabled
  mcp-abap-adt --transport=http --http-port=3000 \\
                --http-allowed-origins=http://localhost:3000,https://example.com

  # Start SSE server on custom port
  mcp-abap-adt --transport=sse --sse-port=3001

  # Start SSE server with CORS and DNS protection
  mcp-abap-adt --transport=sse --sse-port=3001 \\
                --sse-allowed-origins=http://localhost:3000 \\
                --sse-enable-dns-protection

  # Using shortcuts
  mcp-abap-adt --http --http-port=8080
  mcp-abap-adt --sse --sse-port=3001

QUICK REFERENCE:
  Transport types:
    http            - HTTP StreamableHTTP transport (default)
    streamable-http - Same as http
    stdio           - Standard input/output (for MCP clients, requires .env file or --mcp parameter)
    sse             - Server-Sent Events transport

  Common use cases:
    Web interfaces (HTTP):        mcp-abap-adt (default, no .env needed)
    MCP clients (Cline, Cursor):  mcp-abap-adt --transport=stdio
    MCP clients with auth-broker: mcp-abap-adt --transport=stdio --mcp=TRIAL (skips .env)
    Web interfaces (SSE):         mcp-abap-adt --transport=sse --sse-port=3001
    SSE with auth-broker:         mcp-abap-adt --transport=sse --mcp=TRIAL (skips .env)

DOCUMENTATION:
  https://github.com/fr0ster/mcp-abap-adt
  Installation:    docs/installation/INSTALLATION.md
  Configuration:   docs/user-guide/CLIENT_CONFIGURATION.md

AUTHENTICATION:
  For JWT authentication with SAP BTP service keys:
  1. Install: npm install -g @mcp-abap-adt/connection
  2. Run:     sap-abap-auth auth -k path/to/service-key.json
  3. This generates .env file with JWT tokens automatically

SERVICE KEYS (Destination-Based Authentication):
  The server supports destination-based authentication using service keys stored locally.
  This allows you to configure authentication once per destination and reuse it.

  IMPORTANT: Auth-broker (service keys) is only available for HTTP/streamable-http transport.
  For stdio and SSE transports, use .env file instead.

  How to Save Service Keys:

  Linux:
    1. Create service keys directory:
       mkdir -p ~/.config/mcp-abap-adt/service-keys

    2. Download service key from SAP BTP (from the corresponding service instance)
       and copy it to: ~/.config/mcp-abap-adt/service-keys/{destination}.json
       (e.g., TRIAL.json - the filename without .json extension becomes the destination name)

    Storage locations:
      Service keys: ~/.config/mcp-abap-adt/service-keys/{destination}.json
      Sessions:     ~/.config/mcp-abap-adt/sessions/{destination}.env

  macOS:
    1. Create service keys directory:
       mkdir -p ~/.config/mcp-abap-adt/service-keys

    2. Download service key from SAP BTP (from the corresponding service instance)
       and copy it to: ~/.config/mcp-abap-adt/service-keys/{destination}.json
       (e.g., TRIAL.json - the filename without .json extension becomes the destination name)

    Storage locations:
      Service keys: ~/.config/mcp-abap-adt/service-keys/{destination}.json
      Sessions:     ~/.config/mcp-abap-adt/sessions/{destination}.env

  Windows:
    1. Create service keys directory (PowerShell):
       New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\\Documents\\mcp-abap-adt\\service-keys"

    2. Download service key from SAP BTP (from the corresponding service instance)
       and copy it to: %USERPROFILE%\\Documents\\mcp-abap-adt\\service-keys\\{destination}.json
       (e.g., TRIAL.json - the filename without .json extension becomes the destination name)

    Or using Command Prompt (cmd):
       mkdir "%USERPROFILE%\\Documents\\mcp-abap-adt\\service-keys"
       (Then copy the downloaded service key file to this directory)

    Storage locations:
      Service keys: %USERPROFILE%\\Documents\\mcp-abap-adt\\service-keys\\{destination}.json
      Sessions:     %USERPROFILE%\\Documents\\mcp-abap-adt\\sessions\\{destination}.env

  Fallback: Server also searches in current working directory (where server is launched)

  Service Key:
    Download the service key JSON file from SAP BTP (from the corresponding service instance)
    and save it as {destination}.json (e.g., TRIAL.json).
    The filename without .json extension becomes the destination name (case-sensitive).

  Using Destinations:
    In HTTP headers, use:
      x-sap-destination: TRIAL    (for SAP Cloud, URL derived from service key)
      x-mcp-destination: TRIAL    (for MCP destinations, URL derived from service key)

    The destination name must exactly match the service key filename (without .json extension, case-sensitive).

    Example Cline configurations (~/.cline/mcp.json):

    1. Stdio with .env file:
      {
        "mcpServers": {
          "mcp-abap-adt-stdio": {
            "type": "stdio",
            "command": "mcp-abap-adt",
            "args": ["--env-path=/path/to/.env"],
            "timeout": 60
          }
        }
      }

    2. Stdio with MCP destination (requires service key):
      {
        "mcpServers": {
          "mcp-abap-adt-mcp": {
            "type": "stdio",
            "command": "mcp-abap-adt",
            "args": ["--unsafe", "--mcp=trial"],
            "timeout": 60,
            "autoApprove": []
          }
        }
      }

    3. SSE with .env (requires server running):
      {
        "mcpServers": {
          "mcp-abap-adt-sse": {
            "type": "sse",
            "url": "http://localhost:3001/sse",
            "timeout": 60
          }
        }
      }

    4. HTTP with destination (requires proxy server running):
      {
        "mcpServers": {
          "mcp-abap-adt-http": {
            "type": "streamableHttp",
            "url": "http://localhost:3001/mcp/stream/http",
            "headers": {
              "x-mcp-destination": "trial"
            },
            "timeout": 60
          }
        }
      }

    5. HTTP with direct auth (manual token refresh needed):
      {
        "mcpServers": {
          "mcp-abap-adt-direct": {
            "type": "streamableHttp",
            "url": "http://localhost:3000/mcp/stream/http",
            "headers": {
              "x-sap-url": "https://your-system.com",
              "x-sap-auth-type": "jwt",
              "x-sap-jwt-token": "your-token",
              "x-sap-refresh-token": "your-refresh-token"
            },
            "timeout": 60
          }
        }
      }

  First-Time Authentication:
    - Server reads service key from {destination}.json
    - Opens browser for OAuth2 authentication (if no valid session exists)
    - Saves tokens to {destination}.env for future use
    - Subsequent requests use cached tokens automatically

  Automatic Token Management:
    - Validates tokens before use
    - Refreshes expired tokens using refresh tokens
    - Caches valid tokens for performance
    - Falls back to browser authentication if refresh fails

  Custom Paths:
    Set AUTH_BROKER_PATH environment variable to override default paths:
      Linux/macOS: export AUTH_BROKER_PATH="/custom/path:/another/path"
      Windows:     set AUTH_BROKER_PATH=C:\\custom\\path;C:\\another\\path

    Or use --auth-broker-path command-line option:
      mcp-abap-adt --auth-broker --auth-broker-path=~/prj/tmp/
      This creates service-keys and sessions subdirectories in the specified path.

  For more details, see: docs/user-guide/CLIENT_CONFIGURATION.md#destination-based-authentication

`;
  console.log(help);
  process.exit(0);
}

export type TransportConfig =
  | { type: 'stdio' }
  | {
      type: 'streamable-http';
      host: string;
      port: number;
      enableJsonResponse: boolean;
      allowedOrigins?: string[];
      allowedHosts?: string[];
      enableDnsRebindingProtection: boolean;
    }
  | {
      type: 'sse';
      host: string;
      port: number;
      allowedOrigins?: string[];
      allowedHosts?: string[];
      enableDnsRebindingProtection: boolean;
    };

export function getArgValue(name: string): string | undefined {
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith(`${name}=`)) {
      return arg.slice(name.length + 1);
    }
    if (arg === name && i + 1 < args.length) {
      return args[i + 1];
    }
  }
  return undefined;
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

export function parseBoolean(value?: string): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

export function resolvePortOption(
  argName: string,
  envName: string,
  defaultValue: number,
): number {
  const rawValue = getArgValue(argName) ?? process.env[envName];
  if (!rawValue) {
    return defaultValue;
  }

  const port = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port value for ${argName}: ${rawValue}`);
  }

  return port;
}

export function resolveBooleanOption(
  argName: string,
  envName: string,
  defaultValue: boolean,
): boolean {
  const argValue = getArgValue(argName);
  if (argValue !== undefined) {
    return parseBoolean(argValue);
  }
  if (hasFlag(argName)) {
    return true;
  }
  const envValue = process.env[envName];
  if (envValue !== undefined) {
    return parseBoolean(envValue);
  }
  return defaultValue;
}

export function resolveListOption(
  argName: string,
  envName: string,
): string[] | undefined {
  const rawValue = getArgValue(argName) ?? process.env[envName];
  if (!rawValue) {
    return undefined;
  }
  const items = rawValue
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return items.length > 0 ? items : undefined;
}

export function parseTransportConfig(transportType: string): TransportConfig {
  // Use the transport type provided as parameter
  const normalized = transportType;

  if (
    normalized &&
    normalized !== 'stdio' &&
    normalized !== 'http' &&
    normalized !== 'streamable-http' &&
    normalized !== 'server' &&
    normalized !== 'sse'
  ) {
    throw new Error(`Unsupported transport: ${normalized}`);
  }

  const sseRequested = normalized === 'sse' || hasFlag('--sse');

  if (sseRequested) {
    const port = resolvePortOption('--sse-port', 'MCP_SSE_PORT', 3001);
    // Default to localhost (127.0.0.1) for security - only accepts local connections
    // Use 0.0.0.0 to accept connections from all interfaces (less secure)
    const host =
      getArgValue('--sse-host') ?? process.env.MCP_SSE_HOST ?? '127.0.0.1';
    const allowedOrigins = resolveListOption(
      '--sse-allowed-origins',
      'MCP_SSE_ALLOWED_ORIGINS',
    );
    const allowedHosts = resolveListOption(
      '--sse-allowed-hosts',
      'MCP_SSE_ALLOWED_HOSTS',
    );
    const enableDnsRebindingProtection = resolveBooleanOption(
      '--sse-enable-dns-protection',
      'MCP_SSE_ENABLE_DNS_PROTECTION',
      false,
    );

    return {
      type: 'sse',
      host,
      port,
      allowedOrigins,
      allowedHosts,
      enableDnsRebindingProtection,
    };
  }

  const httpRequested =
    normalized === 'http' ||
    normalized === 'streamable-http' ||
    normalized === 'server' ||
    hasFlag('--http') ||
    // Note: Default is stdio (set in runtimeConfig), so this only applies if explicitly requested
    (!sseRequested && normalized !== 'stdio');

  if (httpRequested) {
    const port = resolvePortOption('--http-port', 'MCP_HTTP_PORT', 3000);
    // Default to localhost (127.0.0.1) for security - only accepts local connections
    // Use 0.0.0.0 to accept connections from all interfaces (less secure)
    const host =
      getArgValue('--http-host') ?? process.env.MCP_HTTP_HOST ?? '127.0.0.1';
    const enableJsonResponse = resolveBooleanOption(
      '--http-json-response',
      'MCP_HTTP_ENABLE_JSON_RESPONSE',
      false,
    );
    const allowedOrigins = resolveListOption(
      '--http-allowed-origins',
      'MCP_HTTP_ALLOWED_ORIGINS',
    );
    const allowedHosts = resolveListOption(
      '--http-allowed-hosts',
      'MCP_HTTP_ALLOWED_HOSTS',
    );
    const enableDnsRebindingProtection = resolveBooleanOption(
      '--http-enable-dns-protection',
      'MCP_HTTP_ENABLE_DNS_PROTECTION',
      false,
    );

    return {
      type: 'streamable-http',
      host,
      port,
      enableJsonResponse,
      allowedOrigins,
      allowedHosts,
      enableDnsRebindingProtection,
    };
  }

  return { type: 'stdio' };
}

let sapConfigOverride: SapConfig | undefined;

export interface ServerOptions {
  sapConfig?: SapConfig;
  connection?: IAbapConnection;
  transportConfig?: TransportConfig;
  allowProcessExit?: boolean;
  registerSignalHandlers?: boolean;
}

export function setSapConfigOverride(config?: SapConfig) {
  sapConfigOverride = config;
  setConfigOverride(config);
}

export function setAbapConnectionOverride(connection?: IAbapConnection) {
  setConnectionOverride(connection);
}

/**
 * Retrieves SAP configuration from environment variables.
 * Reads configuration from process.env (caller is responsible for loading .env file if needed).
 *
 * @returns {SapConfig} The SAP configuration object.
 * @throws {Error} If any required environment variable is missing.
 */
// Helper function for Windows-compatible logging
// Only logs when DEBUG_CONNECTORS, DEBUG_TESTS, or DEBUG_ADT_TESTS is enabled
function debugLog(message: string): void {
  const debugEnabled =
    process.env.DEBUG_CONNECTORS === 'true' ||
    process.env.DEBUG_TESTS === 'true' ||
    process.env.DEBUG_ADT_TESTS === 'true';

  if (!debugEnabled) {
    return; // Suppress debug logs when not in debug mode
  }

  // Try stderr first
  try {
    process.stderr.write(message);
  } catch (_e) {
    // Fallback to console.error for Windows
    console.error(message.trim());
  }
  // Also try to write to a debug file on Windows
  if (process.platform === 'win32') {
    try {
      const fs = require('node:fs');
      const path = require('node:path');
      const debugFile = path.join(process.cwd(), 'mcp-debug.log');
      fs.appendFileSync(
        debugFile,
        `${new Date().toISOString()} ${message}`,
        'utf8',
      );
    } catch (_e) {
      // Ignore file write errors
    }
  }
}

// Re-export header constants from interfaces package
export * from '@mcp-abap-adt/interfaces';

export function getConfig(): SapConfig {
  debugLog(`[MCP-CONFIG] getConfig() called\n`);

  if (sapConfigOverride) {
    debugLog(`[MCP-CONFIG] Using override config\n`);
    return sapConfigOverride;
  }

  // Read from process.env (already loaded and cleaned by launcher or at startup)
  // No need to reload .env here - it's already in process.env
  let url = process.env.SAP_URL;
  let client = process.env.SAP_CLIENT;

  debugLog(
    `[MCP-CONFIG] Raw process.env.SAP_URL: "${url}" (type: ${typeof url}, length: ${url?.length || 0})\n`,
  );

  // URLs from .env files are expected to be clean - just trim
  if (url) {
    url = url.trim();
  } else {
    // Log if URL is missing
    debugLog(`[MCP-CONFIG] ✗ SAP_URL is missing from process.env\n`);
    debugLog(
      `[MCP-CONFIG] Available env vars: ${Object.keys(process.env)
        .filter((k) => k.startsWith('SAP_'))
        .join(', ')}\n`,
    );
  }

  if (client) {
    client = client.trim();
  }

  // Auto-detect auth type: if JWT token is present, use JWT; otherwise check SAP_AUTH_TYPE or default to basic
  let authType: SapConfig['authType'] = 'basic';
  if (process.env.SAP_JWT_TOKEN) {
    authType = 'jwt';
  } else if (process.env.SAP_AUTH_TYPE) {
    const rawAuthType = process.env.SAP_AUTH_TYPE.trim();
    authType =
      rawAuthType === 'xsuaa' ? 'jwt' : (rawAuthType as SapConfig['authType']);
  }

  if (!url) {
    throw new Error(
      `Missing SAP_URL in environment variables. Please check your .env file.`,
    );
  }

  // Final validation - URL should be clean now
  if (!/^https?:\/\//.test(url)) {
    // Log URL in hex for debugging
    const urlHex = Buffer.from(url, 'utf8').toString('hex');
    throw new Error(
      `Invalid SAP_URL format: "${url}" (hex: ${urlHex.substring(0, 100)}...). Expected format: https://your-system.sap.com`,
    );
  }

  // Additional validation: try to create URL object to catch any remaining issues
  try {
    const testUrl = new URL(url);
    // If URL object creation succeeds, use the normalized URL
    url = testUrl.href.replace(/\/$/, ''); // Remove trailing slash if present
  } catch (urlError) {
    const urlHex = Buffer.from(url, 'utf8').toString('hex');
    throw new Error(
      `Invalid SAP_URL: "${url}" (hex: ${urlHex.substring(0, 100)}...). Error: ${urlError instanceof Error ? urlError.message : urlError}`,
    );
  }

  // Log URL for debugging
  debugLog(`[MCP-CONFIG] Final SAP_URL: "${url}" (length: ${url.length})\n`);

  const config: SapConfig = {
    url, // Already cleaned and validated above
    authType,
  };

  if (client) {
    config.client = client;
  }

  if (authType === 'jwt') {
    const jwtToken = process.env.SAP_JWT_TOKEN;
    if (!jwtToken) {
      throw new Error('Missing SAP_JWT_TOKEN for JWT authentication');
    }
    // Values from .env are expected to be clean
    config.jwtToken = jwtToken.trim();
    const refreshToken = process.env.SAP_REFRESH_TOKEN;
    if (refreshToken) {
      config.refreshToken = refreshToken.trim();
    }
    const uaaUrl = process.env.SAP_UAA_URL || process.env.UAA_URL;
    const uaaClientId =
      process.env.SAP_UAA_CLIENT_ID || process.env.UAA_CLIENT_ID;
    const uaaClientSecret =
      process.env.SAP_UAA_CLIENT_SECRET || process.env.UAA_CLIENT_SECRET;
    if (uaaUrl) config.uaaUrl = uaaUrl.trim();
    if (uaaClientId) config.uaaClientId = uaaClientId.trim();
    if (uaaClientSecret) config.uaaClientSecret = uaaClientSecret.trim();
  } else {
    const username = process.env.SAP_USERNAME;
    const password = process.env.SAP_PASSWORD;
    if (!username || !password) {
      throw new Error(
        'Missing SAP_USERNAME or SAP_PASSWORD for basic authentication',
      );
    }
    config.username = username.trim();
    config.password = password.trim();
  }

  return config;
}

/**
 * Mask sensitive values (tokens, secrets) for safe logging
 *
 * Rules:
 * - Long values (>20 chars): show first 4 and last 4 chars with *** in between
 * - Short values (<=20 chars): fully mask with asterisks
 * - Empty/undefined: return placeholder
 *
 * @param value - The sensitive value to mask
 * @param placeholder - Placeholder for empty values (default: '(not set)')
 * @returns Masked string safe for logging
 */
export function maskSensitiveValue(
  value: string | undefined | null,
  placeholder = '(not set)',
): string {
  if (!value || value.trim() === '') {
    return placeholder;
  }

  const trimmed = value.trim();

  // Long values: show first 4 and last 4 chars
  if (trimmed.length > 20) {
    return `${trimmed.substring(0, 4)}***${trimmed.substring(trimmed.length - 4)}`;
  }

  // Short values: fully mask
  return '*'.repeat(trimmed.length);
}

/**
 * Format auth configuration for display at server startup
 * Shows connection details with masked sensitive values
 */
export interface AuthDisplayConfig {
  envFile?: string;
  serviceUrl?: string;
  sapClient?: string;
  authType?: string;
  username?: string;
  password?: string;
  jwtToken?: string;
  refreshToken?: string;
  uaaUrl?: string;
  uaaClientId?: string;
  uaaClientSecret?: string;
}

/**
 * Format auth configuration for console output
 * @param config - Auth configuration to display
 * @param source - Source of the config (e.g., 'e19.env', 'service-key')
 * @returns Formatted string for console output
 */
export function formatAuthConfigForDisplay(
  config: AuthDisplayConfig,
  source?: string,
): string {
  const lines: string[] = [];

  lines.push(
    '╔══════════════════════════════════════════════════════════════╗',
  );
  lines.push(
    '║                   SAP Connection Config                      ║',
  );
  lines.push(
    '╠══════════════════════════════════════════════════════════════╣',
  );

  if (source) {
    lines.push(`║  Source:        ${source.padEnd(45)}║`);
  }

  if (config.serviceUrl) {
    const url =
      config.serviceUrl.length > 45
        ? config.serviceUrl.substring(0, 42) + '...'
        : config.serviceUrl;
    lines.push(`║  SAP URL:       ${url.padEnd(45)}║`);
  }

  if (config.sapClient) {
    lines.push(`║  SAP Client:    ${config.sapClient.padEnd(45)}║`);
  }

  if (config.authType) {
    lines.push(`║  Auth Type:     ${config.authType.padEnd(45)}║`);
  }

  if (config.authType === 'basic') {
    if (config.username) {
      lines.push(`║  Username:      ${config.username.padEnd(45)}║`);
    }
    if (config.password) {
      lines.push(
        `║  Password:      ${maskSensitiveValue(config.password).padEnd(45)}║`,
      );
    }
  }

  if (config.authType === 'jwt') {
    if (config.jwtToken) {
      lines.push(
        `║  JWT Token:     ${maskSensitiveValue(config.jwtToken).padEnd(45)}║`,
      );
    }
    if (config.refreshToken) {
      lines.push(
        `║  Refresh Token: ${maskSensitiveValue(config.refreshToken).padEnd(45)}║`,
      );
    }
    if (config.uaaUrl) {
      const uaaUrl =
        config.uaaUrl.length > 45
          ? config.uaaUrl.substring(0, 42) + '...'
          : config.uaaUrl;
      lines.push(`║  UAA URL:       ${uaaUrl.padEnd(45)}║`);
    }
    if (config.uaaClientId) {
      lines.push(
        `║  UAA Client ID: ${maskSensitiveValue(config.uaaClientId).padEnd(45)}║`,
      );
    }
    if (config.uaaClientSecret) {
      lines.push(
        `║  UAA Secret:    ${maskSensitiveValue(config.uaaClientSecret).padEnd(45)}║`,
      );
    }
  }

  lines.push(
    '╚══════════════════════════════════════════════════════════════╝',
  );

  return lines.join('\n');
}

export function parseActivationResponse(responseData: any) {
  const { XMLParser } = require('fast-xml-parser');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: true,
  });

  try {
    const data =
      typeof responseData === 'string'
        ? responseData
        : responseData?.data || JSON.stringify(responseData);
    const result = parser.parse(data);
    const properties = result['chkl:messages']?.['chkl:properties'];
    const activated =
      properties?.['@_activationExecuted'] === 'true' ||
      properties?.['@_activationExecuted'] === true;
    const checked =
      properties?.['@_checkExecuted'] === 'true' ||
      properties?.['@_checkExecuted'] === true;
    const generated =
      properties?.['@_generationExecuted'] === 'true' ||
      properties?.['@_generationExecuted'] === true;
    const messages: Array<{
      type: string;
      text: string;
      line?: number;
      column?: number;
    }> = [];
    const msgData = result['chkl:messages']?.msg;
    if (msgData) {
      const msgArray = Array.isArray(msgData) ? msgData : [msgData];
      msgArray.forEach((msg: any) => {
        messages.push({
          type: msg['@_type'] || 'info',
          text: msg.shortText?.txt || msg.shortText || 'Unknown message',
          line: msg['@_line'],
          column: msg['@_column'],
        });
      });
    }
    return {
      activated,
      checked,
      generated,
      messages,
    };
  } catch (error) {
    return {
      activated: false,
      checked: false,
      generated: false,
      messages: [
        {
          type: 'error',
          text: `Failed to parse activation response: ${error}`,
        },
      ],
    };
  }
}
