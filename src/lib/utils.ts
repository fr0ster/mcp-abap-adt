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
import { logger } from "./logger";
import { notifyConnectionResetListeners, registerConnectionResetHook } from "./connectionEvents";

// Initialize connection variables before exports to avoid circular dependency issues
// Variables are initialized immediately to avoid TDZ (Temporal Dead Zone) issues
let overrideConfig: SapConfig | undefined = undefined;
let overrideConnection: AbapConnection | undefined = undefined;
let cachedConnection: AbapConnection | undefined = undefined;
let cachedConfigSignature: string | undefined = undefined;

// Session storage for stateful sessions (persists cookies and CSRF tokens)
const sessionStorage = new FileSessionStorage({
  sessionDir: '.sessions',
  createDir: true,
  prettyPrint: false
});

// Fixed session ID for server connection (allows session persistence across requests)
const SERVER_SESSION_ID = 'mcp-abap-adt-session';

export { McpError, ErrorCode, AxiosResponse, getTimeout, getTimeoutConfig, logger };

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
export function return_error(error: any) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `Error: ${
          error instanceof AxiosError
            ? String(error.response?.data)
            : error instanceof Error
            ? error.message
            : String(error)
        }`,
      },
    ],
  };
}

function disposeConnection(connection?: AbapConnection) {
  if (connection) {
    connection.reset();
  }
}

export function getManagedConnection(): AbapConnection {
  if (overrideConnection) {
    return overrideConnection;
  }

  const config = overrideConfig ?? getConfig();
  const signature = sapConfigSignature(config);

  if (!cachedConnection || cachedConfigSignature !== signature) {
    logger.debug(`[DEBUG] getManagedConnection - Creating new connection (cached: ${!!cachedConnection}, signature changed: ${cachedConfigSignature !== signature})`);
    if (cachedConnection) {
      logger.debug(`[DEBUG] getManagedConnection - Old signature: ${cachedConfigSignature?.substring(0, 100)}...`);
      logger.debug(`[DEBUG] getManagedConnection - New signature: ${signature.substring(0, 100)}...`);
    }
    disposeConnection(cachedConnection);
    cachedConnection = createAbapConnection(config, loggerAdapter, sessionStorage, SERVER_SESSION_ID);
    cachedConfigSignature = signature;

    // Enable stateful session mode to allow session persistence
    // Note: enableStatefulSession is available in AbstractAbapConnection but not in AbapConnection interface
    // If sessionStorage and sessionId are provided to createAbapConnection, stateful session should be enabled automatically
    // But we call it explicitly to ensure it's enabled
    const connectionWithStateful = cachedConnection as any;
    if (connectionWithStateful.enableStatefulSession) {
      connectionWithStateful.enableStatefulSession(SERVER_SESSION_ID, sessionStorage).catch((error: any) => {
        logger.warn("Failed to enable stateful session", {
          type: "STATEFUL_SESSION_ENABLE_FAILED",
          error: error instanceof Error ? error.message : String(error),
        });
      });
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
    logger.debug(`[DEBUG] getManagedConnection - Reusing cached connection (signature matches)`);
  }

  return cachedConnection;
}

export function setConfigOverride(override?: SapConfig) {
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
  const currentOverride = overrideConnection;
  if (currentOverride) {
    disposeConnection(currentOverride);
  }
  overrideConnection = connection;
  overrideConfig = undefined;

  const currentCached = cachedConnection;
  disposeConnection(currentCached);
  cachedConnection = undefined;
  cachedConfigSignature = undefined;
  notifyConnectionResetListeners();
}

export function cleanup() {
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
  const { getReadOnlyClient } = await import('./clients');
  return getReadOnlyClient().fetchNodeStructure(parentName, parentTechName, parentType, nodeKey, withShortDescriptions);
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
  const { getReadOnlyClient } = await import('./clients');
  return getReadOnlyClient().getSystemInformation();
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
