import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { AxiosError, AxiosResponse } from "axios";
import { getConfig } from "../index"; // getConfig needs to be exported from index.ts
import {
  AbapConnection,
  createAbapConnection,
  SapConfig,
  sapConfigSignature,
  getTimeout,
  getTimeoutConfig,
  FileSessionStorage,
} from "@mcp-abap-adt/connection";
import { encodeSapObjectName } from "@mcp-abap-adt/adt-clients";
import { loggerAdapter } from "./loggerAdapter";
import { logger, connectionManagerLogger } from "./logger";
import { notifyConnectionResetListeners, registerConnectionResetHook } from "./connectionEvents";
import { AsyncLocalStorage } from "async_hooks";
import * as crypto from "crypto";
import * as path from "path";
import * as os from "os";

// Initialize connection variables before exports to avoid circular dependency issues
// Variables are initialized immediately to avoid TDZ (Temporal Dead Zone) issues
let overrideConfig: SapConfig | undefined;
let overrideConnection: AbapConnection | undefined;
let cachedConnection: AbapConnection | undefined;
let cachedConfigSignature: string | undefined;

// Connection cache per session + config hash
interface ConnectionCacheEntry {
  connection: AbapConnection;
  configSignature: string;
  sessionId: string;
  lastUsed: Date;
}

const connectionCache = new Map<string, ConnectionCacheEntry>();

// AsyncLocalStorage for storing session context
export const sessionContext = new AsyncLocalStorage<{
  sessionId?: string;
  sapConfig?: SapConfig;
}>();

// Session storage for stateful sessions (persists cookies and CSRF tokens)
// Only enabled if MCP_ENABLE_SESSION_STORAGE=true or MCP_SESSION_DIR is set
// When disabled, each request creates a fresh connection (stateless mode)
let sessionStorage: FileSessionStorage | undefined;

if (process.env.MCP_ENABLE_SESSION_STORAGE === 'true' || process.env.MCP_SESSION_DIR) {
  const sessionDir = process.env.MCP_SESSION_DIR || path.join(os.tmpdir(), 'mcp-abap-adt-sessions');
  sessionStorage = new FileSessionStorage({
    sessionDir: sessionDir,
    createDir: true,
    prettyPrint: false
  });
  logger.info(`Session storage enabled: ${sessionDir}`);
} else {
  logger.info('Session storage disabled (stateless mode)');
}

// Fixed session ID for server connection (allows session persistence across requests)
const SERVER_SESSION_ID = 'mcp-abap-adt-session';

export { McpError, ErrorCode, getTimeout, getTimeoutConfig, logger };
export type { AxiosResponse };

/**
 * Encodes SAP object names for use in URLs
 * Re-exported from @mcp-abap-adt/adt-clients for backward compatibility
 * @deprecated Use encodeSapObjectName from @mcp-abap-adt/adt-clients directly
 */
export { encodeSapObjectName } from "@mcp-abap-adt/adt-clients";

export function return_response(response: AxiosResponse) {
  return {
    isError: false,
    content: [
      {
        type: "text",
        text: response.data,
      },
    ],
  };
}
/**
 * Safely serializes an error object, avoiding circular references
 */
function safeStringifyError(error: any): string {
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
        } catch (e) {
          safeError.responseData = String(error.response.data).substring(0, 1000);
        }
      }
    }

    try {
      return JSON.stringify(safeError, null, 2);
    } catch (e) {
      return `AxiosError: ${error.message} (Status: ${error.response?.status})`;
    }
  } else if (error instanceof Error) {
    return error.message;
  } else {
    try {
      return JSON.stringify(error, null, 2);
    } catch (e) {
      return String(error);
    }
  }
}

/**
 * Safely logs an error without circular reference issues
 */
export function logErrorSafely(logger: any, operationName: string, error: any): void {
  if (!logger?.error) {
    return;
  }

  let errorMessage = `[ERROR] ${operationName} failed`;
  let errorDetails: any = {};

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
          errorDetails.responseData = JSON.stringify(error.response.data).substring(0, 500);
        } catch (e) {
          errorDetails.responseData = String(error.response.data).substring(0, 500);
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

  logger.error(errorMessage, errorDetails);
}

export function return_error(error: any) {
  // Safely extract error message to avoid circular reference issues
  // Always extract only safe properties, never serialize the entire error object
  let errorText: string;

  try {
    if (error instanceof AxiosError) {
      // For Axios errors, safely extract response data
      if (error.response?.data) {
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
              if (key === 'socket' || key === '_httpMessage' || key === 'res' || key === 'req') {
                return '[HTTP Object]';
              }
              return value;
            }).substring(0, 2000);
          } catch (e) {
            errorText = `HTTP ${error.response.status}: ${error.response.statusText || 'Error'}`;
          }
        }
      } else {
        errorText = error.message || `HTTP ${error.response?.status || 'Unknown error'}`;
      }
    } else if (error instanceof Error) {
      errorText = error.message;
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
          if (key === 'socket' || key === '_httpMessage' || key === 'res' || key === 'req') {
            return '[HTTP Object]';
          }
          return value;
        }).substring(0, 2000);
      } catch (e) {
        errorText = String(error).substring(0, 2000);
      }
    }
  } catch (e) {
    // Fallback if all else fails
    errorText = 'An error occurred (failed to serialize error details)';
  }

  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Error: ${errorText}`,
      },
    ],
  };
}

function disposeConnection(connection?: AbapConnection) {
  if (connection) {
    connection.reset();
  }
}

/**
 * Generate cache key for connection based on sessionId and config signature
 * This ensures each client session with different SAP config gets its own connection
 */
function generateConnectionCacheKey(sessionId: string, configSignature: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(sessionId);
  hash.update(configSignature);
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
      connectionManagerLogger.debug(`[DEBUG] Cleaning up old connection cache entry: ${key.substring(0, 16)}...`);
      disposeConnection(entry.connection);
      connectionCache.delete(key);
    }
  }
}

/**
 * Get or create connection for a specific session and config
 */
function getConnectionForSession(sessionId: string, config: SapConfig): AbapConnection {
  const configSignature = sapConfigSignature(config);
  const cacheKey = generateConnectionCacheKey(sessionId, configSignature);

  // Clean up old entries periodically
  if (connectionCache.size > 100) {
    cleanupConnectionCache();
  }

  let entry = connectionCache.get(cacheKey);

  if (!entry || entry.configSignature !== configSignature) {
    connectionManagerLogger.debug(`[DEBUG] getManagedConnection - Creating new connection for session ${sessionId.substring(0, 8)}... (cache key: ${cacheKey.substring(0, 16)}...)`);

    // Dispose old connection if exists
    if (entry) {
      disposeConnection(entry.connection);
    }

    // Create new connection with unique session ID per client session
    const connectionSessionId = `mcp-abap-adt-session-${sessionId}`;
    const connection = createAbapConnection(config, loggerAdapter, sessionStorage, connectionSessionId);

    // Enable stateful session mode
    const connectionWithStateful = connection as any;
    if (connectionWithStateful.enableStatefulSession) {
      try {
        const statefulResult = connectionWithStateful.enableStatefulSession(connectionSessionId, sessionStorage);
        if (statefulResult && typeof statefulResult.catch === 'function') {
          statefulResult.catch((error: any) => {
            logger.warn("Failed to enable stateful session", {
              type: "STATEFUL_SESSION_ENABLE_FAILED",
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
      } catch (error: any) {
        logger.warn("Failed to enable stateful session", {
          type: "STATEFUL_SESSION_ENABLE_FAILED",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Connect and verify session state
    connection.connect().catch((error) => {
      logger.warn("Failed to connect after creating new connection", {
        type: "CONNECTION_INIT_FAILED",
        error: error instanceof Error ? error.message : String(error),
      });
    });

    entry = {
      connection,
      configSignature,
      sessionId,
      lastUsed: new Date(),
    };

    connectionCache.set(cacheKey, entry);
  } else {
    entry.lastUsed = new Date();
    connectionManagerLogger.debug(`[DEBUG] getManagedConnection - Reusing cached connection for session ${sessionId.substring(0, 8)}...`);
  }

  return entry.connection;
}

export function getManagedConnection(): AbapConnection {
  // If override connection is set, use it (for backward compatibility)
  if (overrideConnection) {
    return overrideConnection;
  }

  // Try to get session context from AsyncLocalStorage
  const context = sessionContext.getStore();

  if (context?.sessionId && context?.sapConfig) {
    // Use session-specific connection
    return getConnectionForSession(context.sessionId, context.sapConfig);
  }

  // Fallback to global config (for backward compatibility with non-HTTP transports)
  const config = overrideConfig ?? getConfig();

  // Helper function for Windows-compatible logging
  const debugLog = (message: string): void => {
    // Try stderr first
    try {
      process.stderr.write(message);
    } catch (e) {
      // Fallback to console.error for Windows
      console.error(message.trim());
    }
    // Also try to write to a debug file on Windows
    if (process.platform === 'win32') {
      try {
        const fs = require('fs');
        const path = require('path');
        const debugFile = path.join(process.cwd(), 'mcp-debug.log');
        fs.appendFileSync(debugFile, `${new Date().toISOString()} ${message}`, 'utf8');
      } catch (e) {
        // Ignore file write errors
      }
    }
  };

  // Debug logging - verify URL is clean before creating connection (always)
  if (config.url) {
    const urlHex = Buffer.from(config.url, 'utf8').toString('hex');
    debugLog(`[MCP-UTILS] Creating connection with URL: "${config.url}" (length: ${config.url.length}, hex: ${urlHex.substring(0, 60)}...)\n`);
    if (config.url.includes('#')) {
      debugLog(`[MCP-UTILS] ✗ ERROR: URL contains # character in config object!\n`);
    }
    if (/[\x00-\x1F\x7F-\x9F]/.test(config.url)) {
      debugLog(`[MCP-UTILS] ✗ ERROR: URL contains control characters in config object!\n`);
    }
  } else {
    debugLog(`[MCP-UTILS] ✗ ERROR: config.url is missing!\n`);
  }

  const signature = sapConfigSignature(config);

  if (!cachedConnection || cachedConfigSignature !== signature) {
    connectionManagerLogger.debug(`[DEBUG] getManagedConnection - Creating new connection (cached: ${!!cachedConnection}, signature changed: ${cachedConfigSignature !== signature})`);
    if (cachedConnection) {
      connectionManagerLogger.debug(`[DEBUG] getManagedConnection - Old signature: ${cachedConfigSignature?.substring(0, 100)}...`);
      connectionManagerLogger.debug(`[DEBUG] getManagedConnection - New signature: ${signature.substring(0, 100)}...`);
    }

    // Log refresh token availability for debugging
    const hasRefreshToken = !!(config.refreshToken && config.refreshToken.trim());
    const hasUaaUrl = !!config.uaaUrl;
    const hasUaaClientId = !!config.uaaClientId;
    const hasUaaClientSecret = !!config.uaaClientSecret;
    connectionManagerLogger.debug(`[DEBUG] getManagedConnection - Refresh token config:`, {
      hasRefreshToken,
      hasUaaUrl,
      hasUaaClientId,
      hasUaaClientSecret,
      canRefresh: hasRefreshToken && hasUaaUrl && hasUaaClientId && hasUaaClientSecret,
      configObjectId: (config as any).__debugId || 'no-id'
    });

    disposeConnection(cachedConnection);
    cachedConnection = createAbapConnection(config, loggerAdapter, sessionStorage, SERVER_SESSION_ID);

    // Verify connection has access to refresh token
    const connectionWithRefresh = cachedConnection as any;
    if (connectionWithRefresh.getConfig && connectionWithRefresh.canRefreshToken) {
      const connectionConfig = connectionWithRefresh.getConfig();
      const canRefresh = connectionWithRefresh.canRefreshToken();
      connectionManagerLogger.debug(`[DEBUG] getManagedConnection - Connection created, refresh check:`, {
        canRefresh,
        connectionHasRefreshToken: !!(connectionConfig?.refreshToken),
        connectionHasUaaUrl: !!(connectionConfig?.uaaUrl),
        configMatches: connectionConfig === config ? 'same object ✓' : 'different object ✗'
      });
    }
    cachedConfigSignature = signature;

    // Enable stateful session mode to allow session persistence
    // Note: enableStatefulSession is available in AbstractAbapConnection but not in AbapConnection interface
    // If sessionStorage and sessionId are provided to createAbapConnection, stateful session should be enabled automatically
    // But we call it explicitly to ensure it's enabled
    const connectionWithStateful = cachedConnection as any;
    if (connectionWithStateful.enableStatefulSession) {
      try {
        const statefulResult = connectionWithStateful.enableStatefulSession(SERVER_SESSION_ID, sessionStorage);
        if (statefulResult && typeof statefulResult.catch === 'function') {
          statefulResult.catch((error: any) => {
            logger.warn("Failed to enable stateful session", {
              type: "STATEFUL_SESSION_ENABLE_FAILED",
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
      } catch (error: any) {
        logger.warn("Failed to enable stateful session", {
          type: "STATEFUL_SESSION_ENABLE_FAILED",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Connect and verify session state (will save if changed)
    // The connect() method in JwtAbapConnection now compares session state and saves only if changed
    cachedConnection.connect().catch((error) => {
      logger.warn("Failed to connect after creating new connection", {
        type: "CONNECTION_INIT_FAILED",
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - connection will be established on first use
    });
  } else {
    connectionManagerLogger.debug(`[DEBUG] getManagedConnection - Reusing cached connection (signature matches)`);
  }

  return cachedConnection;
}

/**
 * Remove connection from cache for a specific session
 * Called when session is closed
 */
export function removeConnectionForSession(sessionId: string, config?: SapConfig) {
  if (config) {
    const configSignature = sapConfigSignature(config);
    const cacheKey = generateConnectionCacheKey(sessionId, configSignature);
    const entry = connectionCache.get(cacheKey);
    if (entry) {
      connectionManagerLogger.debug(`[DEBUG] Removing connection cache entry for session ${sessionId.substring(0, 8)}...`);
      disposeConnection(entry.connection);
      connectionCache.delete(cacheKey);
    }
  } else {
    // Remove all entries for this sessionId
    for (const [key, entry] of connectionCache.entries()) {
      if (entry.sessionId === sessionId) {
        connectionManagerLogger.debug(`[DEBUG] Removing connection cache entry for session ${sessionId.substring(0, 8)}...`);
        disposeConnection(entry.connection);
        connectionCache.delete(key);
      }
    }
  }
}

/**
 * Restore session state in connection using enableStatefulSession
 * This ensures connection properly manages session ID and loads/saves session state
 */
export async function restoreSessionInConnection(
  connection: AbapConnection,
  sessionId: string,
  sessionState: { cookies?: string | null; csrf_token?: string | null; cookie_store?: Record<string, string> }
): Promise<void> {
  // Cast to access enableStatefulSession (not in interface but available in implementation)
  const connectionWithStateful = connection as any;

  if (!connectionWithStateful.enableStatefulSession) {
    // Fallback: just set session state manually
    connection.setSessionState({
      cookies: sessionState.cookies || null,
      csrfToken: sessionState.csrf_token || null,
      cookieStore: sessionState.cookie_store || {}
    });
    return;
  }

  // First, set session state manually (in case storage doesn't have it)
  connection.setSessionState({
    cookies: sessionState.cookies ?? null,
    csrfToken: sessionState.csrf_token ?? null,
    cookieStore: sessionState.cookie_store ?? {}
  });

  // Then enable stateful session - this will:
  // 1. Set sessionId in connection
  // 2. Try to load from storage (if exists, will override our setSessionState)
  // 3. Save current state to storage
  try {
    const result = await connectionWithStateful.enableStatefulSession(sessionId, sessionStorage);
    if (result && typeof result.catch === 'function') {
      await result; // Wait for promise if it returns one
    }
  } catch (error: any) {
    logger.warn("Failed to enable stateful session during restore", {
      sessionId,
      error: error instanceof Error ? error.message : String(error)
    });
    // If enableStatefulSession fails, at least we have setSessionState
  }
}

export function setConfigOverride(override?: SapConfig) {
  connectionManagerLogger.debug(`[DEBUG] setConfigOverride - Setting config override`, {
    hasOverride: !!override,
    overrideHasUrl: !!override?.url
  });
  overrideConfig = override;
  disposeConnection(overrideConnection);
  overrideConnection = override ? createAbapConnection(override, loggerAdapter) : undefined;

  // Reset shared connection so that it will be re-created lazily with fresh config
  disposeConnection(cachedConnection);
  cachedConnection = undefined;
  cachedConfigSignature = undefined;
  notifyConnectionResetListeners();
}

export function setConnectionOverride(connection?: AbapConnection) {
  connectionManagerLogger.debug(`[DEBUG] setConnectionOverride - Setting connection override`, {
    hasOverride: !!connection,
    hadPreviousOverride: !!overrideConnection
  });
  // Use a local variable to avoid TDZ issues
  const currentOverride = overrideConnection;
  if (currentOverride) {
    disposeConnection(currentOverride);
  }
  // Assign after reading to avoid TDZ
  overrideConnection = connection;
  overrideConfig = undefined;

  const currentCached = cachedConnection;
  disposeConnection(currentCached);
  cachedConnection = undefined;
  cachedConfigSignature = undefined;
  notifyConnectionResetListeners();
}

export function cleanup() {
  connectionManagerLogger.debug(`[DEBUG] cleanup - Cleaning up all connections`, {
    hadOverrideConnection: !!overrideConnection,
    hadCachedConnection: !!cachedConnection
  });
  disposeConnection(overrideConnection);
  disposeConnection(cachedConnection);
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
  connectionManagerLogger.debug(`[DEBUG] invalidateConnectionCache - Invalidating connection cache`, {
    hadCachedConnection: !!cachedConnection,
    hadOverrideConnection: !!overrideConnection
  });
  disposeConnection(cachedConnection);
  cachedConnection = undefined;
  cachedConfigSignature = undefined;
  // Also invalidate override connection if it exists
  if (overrideConnection) {
    disposeConnection(overrideConnection);
    overrideConnection = undefined;
  }
  notifyConnectionResetListeners();
}

// Register hook to invalidate connection cache when connection is reset
// This ensures that when token is refreshed in JwtAbapConnection, the cache is invalidated
registerConnectionResetHook(() => {
  // When connection is reset (e.g., after token refresh), invalidate cache
  // so that next getManagedConnection() will recreate connection with updated config
  connectionManagerLogger.debug(`[DEBUG] Connection reset hook - Invalidating cache due to connection reset`);
  cachedConnection = undefined;
  cachedConfigSignature = undefined;
});

export async function getBaseUrl() {
  return getManagedConnection().getBaseUrl();
}

export async function getAuthHeaders() {
  return getManagedConnection().getAuthHeaders();
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
  url: string,
  method: string,
  timeoutType: 'default' | 'csrf' | 'long' | number = 'default',
  data?: any,
  params?: any,
  headers?: Record<string, string>
) {
  const timeout = getTimeout(timeoutType);
  return makeAdtRequest(url, method, timeout, data, params, headers);
}

/**
 * Fetches node structure from SAP ADT repository
 * @deprecated Use getReadOnlyClient().fetchNodeStructure() instead
 */
export async function fetchNodeStructure(
  parentName: string,
  parentTechName: string,
  parentType: string,
  nodeKey: string,
  withShortDescriptions: boolean = true
): Promise<AxiosResponse> {
  // TODO: Add fetchNodeStructure to ReadOnlyClient
  throw new Error('fetchNodeStructure not implemented in ReadOnlyClient yet');
  // const { getReadOnlyClient } = await import('./clients.js');
  // return getReadOnlyClient().fetchNodeStructure(parentName, parentTechName, parentType, nodeKey, withShortDescriptions);
}

export async function makeAdtRequest(
  url: string,
  method: string,
  timeout: number,
  data?: any,
  params?: any,
  headers?: Record<string, string>
) {
  return getManagedConnection().makeAdtRequest({ url, method, timeout, data, params, headers });
}

/**
 * Get system information from SAP ADT (for cloud systems)
 * @deprecated Use getReadOnlyClient().getSystemInformation() instead
 */
export async function getSystemInformation(): Promise<{ systemID?: string; userName?: string } | null> {
  // TODO: Add getSystemInformation to ReadOnlyClient
  throw new Error('getSystemInformation not implemented in ReadOnlyClient yet');
  // const { getReadOnlyClient } = await import('./clients.js');
  // return getReadOnlyClient().getSystemInformation();
}

/**
 * Check if current connection is cloud (JWT auth) or on-premise (basic auth)
 */
export function isCloudConnection(): boolean {
  try {
    const config = getConfig();
    return config.authType === 'jwt';
  } catch {
    return false;
  }
}

/**
 * Parse validation response from ADT
 * Checks for CHECK_RESULT=X (success) or SEVERITY=ERROR with message
 * @param response - AxiosResponse from validation endpoint
 * @returns Parsed validation result with valid, severity, message, exists fields
 */
export function parseValidationResponse(response: AxiosResponse): {
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
      attributeNamePrefix: '@_'
    });
    const result = parser.parse(response.data);

    // Check for exception format (<exc:exception>)
    const exception = result['exc:exception'];
    if (exception) {
      const message = exception['message'] || '';
      const localizedMessage = exception['localizedMessage'] || message;
      const msgText = localizedMessage || message;
      const msgLower = msgText.toLowerCase();

      // Check exception type - ExceptionResourceAlreadyExists means object exists
      const exceptionType = exception['type'] || '';
      const isResourceAlreadyExists = exceptionType === 'ExceptionResourceAlreadyExists' ||
                                      exceptionType.includes('ResourceAlreadyExists') ||
                                      exceptionType.includes('AlreadyExists');

      // InvalidClifName with "already exists" message also means object exists
      const isInvalidClifName = exceptionType === 'InvalidClifName';

      // Check if message indicates object already exists
      const exists = isResourceAlreadyExists ||
                     (isInvalidClifName && msgLower.includes('already exists')) ||
                     msgLower.includes('already exists') ||
                     (msgLower.includes('exist') && (msgLower.includes('table') || msgLower.includes('database') || msgLower.includes('resource') || msgLower.includes('interface') || msgLower.includes('class')));

      return {
        valid: false,
        severity: 'ERROR',
        message: msgText,
        exists: exists ? true : undefined
      };
    }

    // Check for standard format (<asx:abap><asx:values><DATA>)
    const data = result['asx:abap']?.['asx:values']?.['DATA'];
    if (!data) {
      // No data means validation passed
      return { valid: true };
    }

    // Check for CHECK_RESULT=X (success)
    if (data['CHECK_RESULT'] === 'X') {
      return { valid: true };
    }

    // Check for SEVERITY (error/warning)
    const severity = data['SEVERITY'];
    const shortText = data['SHORT_TEXT'] || '';
    const longText = data['LONG_TEXT'] || '';

    // Check if message indicates object already exists
    const msgLower = shortText.toLowerCase();
    const exists = msgLower.includes('already exists') ||
                   msgLower.includes('does already exist') ||
                   (msgLower.includes('exist') && (msgLower.includes('resource') || msgLower.includes('definition') || msgLower.includes('object')));

    return {
      valid: severity !== 'ERROR',
      severity: severity,
      message: shortText,
      longText: longText,
      exists: exists || undefined
    };
  } catch (error) {
    // If parsing fails, check HTTP status
    if (response.status === 200) {
      return { valid: true };
    }
    // If parsing fails and status is not 200, assume validation failed
    return {
      valid: false,
      severity: 'ERROR',
      message: `Validation failed with status ${response.status}`
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
  return msgLower.includes('has been checked') ||
         msgLower.includes('was checked') ||
         msgLower.includes('already checked');
}

/**
 * Check if error message indicates object already exists
 * Used to handle validation errors for existing objects
 * @param error - Error object or error message string
 * @returns true if error indicates object already exists
 */
export function isAlreadyExistsError(error: any): boolean {
  const errorMessage = error?.message || error?.text || String(error || '');
  const msgLower = errorMessage.toLowerCase();
  return msgLower.includes('already exists') ||
         msgLower.includes('does already exist') ||
         msgLower.includes('resource already exists') ||
         msgLower.includes('object already exists');
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
  logger?: { debug?: (message: string, data?: any) => void }
): Promise<T> {
  try {
    return await checkOperation();
  } catch (checkError: any) {
    if (isAlreadyCheckedError(checkError)) {
      // Object was already checked - this is OK, continue
      if (logger?.debug) {
        logger.debug(`${objectName} was already checked - this is OK, continuing`);
      }
      // Return a mock success response or rethrow with handled flag
      // For now, we'll rethrow but mark it as handled
      const handledError = new Error(`Object ${objectName} was already checked`);
      (handledError as any).isAlreadyChecked = true;
      throw handledError;
    }
    // Real check error - rethrow
    throw checkError;
  }
}
