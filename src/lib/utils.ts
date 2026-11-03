import './instance.js';

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { type SapConfig, sapConfigSignature } from '@mcp-abap-adt/connection';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { AxiosError, type AxiosResponse } from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { answerFailure, type McpResult } from './answer';
import { answerRead, type FailureAnswer } from './auth/answerFailure';
import { failureOf } from './auth/failures';
import { hasMethod } from './capability';
import {
  notifyConnectionResetListeners,
  registerConnectionResetHook,
} from './connectionEvents';
import { createAbapConnection } from './connectionFactory.js';
import { credentialFromSapConfig } from './credentialSources.js';
import { connectionManagerLogger, logger } from './logger';
import { loggerAdapter } from './loggerAdapter';
import { endConnection } from './ownedConnections.js';
import { methodFailureOf, payloadCarriedBy } from './strategies/step';
import { getSystemContext } from './systemContext';
import { child, childAt, listOf } from './xml/tree';

// Initialize connection variables before exports to avoid circular dependency issues
// Variables are initialized immediately to avoid TDZ (Temporal Dead Zone) issues
let overrideConfig: SapConfig | undefined;
let overrideConnection: IAbapConnection | undefined;
/** Whether `overrideConnection` was built here, from a config: then it is ours to end. */
let overrideBuilt = false;
let cachedConnection: IAbapConnection | undefined;

/**
 * The end of a connection this module built: its one `disconnect()` —
 * the logoff —, when it is replaced or dropped. One a caller handed in
 * (`setConnectionOverride`) is the caller's, never closed here.
 */
function endManaged(
  connection: IAbapConnection | undefined,
  built: boolean,
): void {
  if (connection !== undefined && built) void endConnection(connection);
}
let cachedConfigSignature: string | undefined;

// AsyncLocalStorage for storing session context
export const sessionContext = new AsyncLocalStorage<{
  sessionId?: string;
  sapConfig?: SapConfig;
  destination?: string;
}>();

// Compatibility re-export: `@mcp-abap-adt/lib/utils` exposes the SDK's McpError /
// ErrorCode before #155. Internal code no longer throws McpError (enforced by
// noMcpErrorInSrc.test.ts, which permits the identifier only in this one export
// declaration and forbids every import or use elsewhere in src), but the public
// subpath keeps re-exporting them so external consumers do not break. New code
// should import these from the SDK directly.
export { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
export type { AxiosResponse };
export { logger };

/**
 * Encodes SAP object names for use in URLs.
 * Mirrors @mcp-abap-adt/adt-clients internal util but avoids unstable exports.
 */
export function encodeSapObjectName(objectName: string): string {
  return encodeURIComponent(objectName);
}

/** What {@link return_response} reads of an answer: its text. */
export interface ResponseText {
  readonly data: string;
}

/** An answer's text as the tool's answer. */
export function return_response(response: ResponseText): McpResult {
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
function _safeStringifyError(error: unknown): string {
  if (error instanceof AxiosError) {
    // For Axios errors, extract safe information
    const safeError: Record<string, unknown> = {
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
  logger: { error?: (message: string, data?: unknown) => void } | undefined,
  operationName: string,
  error: unknown,
): void {
  if (!logger?.error) {
    return;
  }

  let errorMessage = `[ERROR] ${operationName} failed`;
  const errorDetails: Record<string, unknown> = {};

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

/**
 * Extracts a user-facing ADT/SAP error message from Axios/ADT errors.
 * Prioritizes XML exception payloads (<exc:exception>) for detailed messages.
 */
export function extractAdtErrorMessage(
  error: unknown,
  fallback = 'Operation failed',
): string {
  if (!error) {
    return fallback;
  }

  const response = child(error, 'response');
  const responseData = child(response, 'data');

  if (typeof responseData === 'string') {
    const raw = responseData.trim();

    // Try to parse ADT XML exception payloads first.
    if (raw.includes('<exc:exception') || raw.includes('<message')) {
      try {
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
        });
        const exception = child(parser.parse(raw), 'exc:exception');
        const xmlMessage =
          childAt(exception, 'message', '#text') ||
          childAt(exception, 'localizedMessage', '#text') ||
          child(exception, 'message') ||
          child(exception, 'localizedMessage');

        if (xmlMessage && String(xmlMessage).trim().length > 0) {
          return `SAP Error: ${String(xmlMessage).trim()}`;
        }
      } catch {
        // Fall through to plain text.
      }
    }

    if (raw.length > 0) {
      return raw.slice(0, 2000);
    }
  } else if (responseData && typeof responseData === 'object') {
    const dataMessage =
      child(responseData, 'message') ||
      childAt(responseData, 'error', 'message') ||
      child(responseData, 'error_description');
    if (typeof dataMessage === 'string' && dataMessage.trim().length > 0) {
      return dataMessage.trim();
    }
  }

  const message = child(error, 'message');
  if (typeof message === 'string' && message.trim().length > 0) {
    return message.trim();
  }

  const status = child(response, 'status');
  if (status) {
    return `HTTP ${String(status)}: ${String(child(response, 'statusText') || 'Error')}`;
  }

  return fallback;
}

/** Whether `c` is a whitespace code unit (space, tab, line feed, CR, VT, FF). */
function isSpace(c: number): boolean {
  return c === 32 || (c >= 9 && c <= 13);
}

/**
 * The host after the first `ENOTFOUND` followed by whitespace, up to the
 * next whitespace; `undefined` without one. Plain code.
 */
function hostAfterNotFound(text: string): string | undefined {
  const marker = 'ENOTFOUND';
  for (
    let at = text.indexOf(marker);
    at >= 0;
    at = text.indexOf(marker, at + 1)
  ) {
    const afterMarker = at + marker.length;
    let start = afterMarker;
    while (start < text.length && isSpace(text.charCodeAt(start))) start += 1;
    if (start === afterMarker || start === text.length) continue;
    let end = start;
    while (end < text.length && !isSpace(text.charCodeAt(end))) end += 1;
    return text.slice(start, end);
  }
  return undefined;
}

/** `MCP error -<n>: ` at `at`: its length, else 0. */
function mcpErrorPrefixAt(text: string, at: number): number {
  const head = 'MCP error ';
  if (!text.startsWith(head, at)) return 0;
  let i = at + head.length;
  if (text[i] === '-') i += 1;
  const digits = i;
  while (
    i < text.length &&
    text.charCodeAt(i) >= 48 &&
    text.charCodeAt(i) <= 57
  )
    i += 1;
  if (i === digits || !text.startsWith(': ', i)) return 0;
  return i + 2 - at;
}

/**
 * `text` without the SDK's leading `McpError: ` / `MCP error -<n>: `
 * prefixes, however many are stacked. Plain code.
 */
function withoutMcpErrorPrefixes(text: string): string {
  let at = 0;
  for (;;) {
    if (text.startsWith('McpError: ', at)) {
      at += 'McpError: '.length;
      continue;
    }
    const length = mcpErrorPrefixAt(text, at);
    if (length === 0) break;
    at += length;
  }
  return text.slice(at);
}

export function return_error(error: unknown): FailureAnswer {
  // The failure reader first: a chain failure or the server's own
  // refusal is answered as the failure answer — never its message.
  const read = failureOf(error);
  if (read !== undefined) return answerRead(read);
  // A method's error carried on a throw: answered as it is, with its step —
  // the same payload the `answer()` path gives.
  const carried = methodFailureOf(error);
  if (carried !== undefined) return answerFailure(carried);
  // A throw that carries its whole answer (several failures, each as it is).
  const payload = payloadCarriedBy(error);
  if (payload !== undefined) {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
  }

  // Safely extract error message to avoid circular reference issues
  // Always extract only safe properties, never serialize the entire error object
  let errorText: string;

  try {
    if (typeof error === 'string') {
      // Validation sites pass a ready message; this is the shortest path.
      errorText = error;
    } else if (error instanceof AxiosError) {
      // Check for DNS/network errors first
      const errorCode = error.code;
      const errorMessage = error.message || '';

      // Handle DNS resolution errors (common on Windows)
      if (
        errorCode === 'ENOTFOUND' ||
        errorMessage.includes('getaddrinfo ENOTFOUND')
      ) {
        const hostname = hostAfterNotFound(errorMessage) ?? 'unknown host';

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
        const hostname = hostAfterNotFound(errorMessage) ?? 'unknown host';

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

  // Strip SDK McpError prefixes that a custom/external handler group may have
  // baked into a thrown error's message (e.g. `MCP error -32602: bad`, or the
  // stacked `McpError: MCP error -32602: bad`). Our own handlers no longer throw
  // McpError, but the package accepts external handler groups, and both
  // registration paths route any thrown error through here. Schema-validation
  // errors are unaffected: the SDK raises those before our code runs and never
  // reaches return_error.
  errorText = withoutMcpErrorPrefixes(errorText);

  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: errorText,
      },
    ],
  };
}

export function getManagedConnection(): IAbapConnection {
  // If override connection is set, use it (for backward compatibility)
  if (overrideConnection) {
    return overrideConnection;
  }

  // Config must be provided via overrideConfig (from connection provider/broker)
  // No fallback to getConfig() - incompatible with broker-based architecture
  if (!overrideConfig) {
    throw new Error(
      'Connection config must be provided via overrideConfig. In v2 architecture, config comes from connection provider (broker), not from environment variables.',
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
        const debugFile = join(process.cwd(), 'mcp-debug.log');
        appendFileSync(
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
      },
    );

    // The connection it replaces was built here: it ends with its logoff.
    endManaged(cachedConnection, true);

    // Generate unique session ID for fallback connections to prevent session sharing
    // When sessionContext is not available, each connection should have its own isolated session
    // This prevents cookies/CSRF tokens from being shared between different connections
    const fallbackSessionId = `mcp-abap-adt-fallback-${randomUUID()}`;
    connectionManagerLogger?.debug(
      `[DEBUG] getManagedConnection - Creating fallback connection with unique session ID: ${fallbackSessionId.substring(0, 32)}...`,
    );

    cachedConnection = createAbapConnection(
      config,
      credentialFromSapConfig(config),
      loggerAdapter,
      fallbackSessionId,
    );

    cachedConfigSignature = signature;

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

export function setConfigOverride(override?: SapConfig) {
  connectionManagerLogger?.debug(
    `[DEBUG] setConfigOverride - Setting config override`,
    {
      hasOverride: !!override,
      overrideHasUrl: !!override?.url,
    },
  );
  overrideConfig = override;
  endManaged(overrideConnection, overrideBuilt);
  overrideConnection = override
    ? createAbapConnection(
        override,
        credentialFromSapConfig(override),
        loggerAdapter,
      )
    : undefined;
  overrideBuilt = override !== undefined;

  // Reset shared connection so that it will be re-created lazily with fresh config
  endManaged(cachedConnection, true);
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
  endManaged(currentOverride, overrideBuilt);
  // Assign after reading to avoid TDZ
  overrideConnection = connection;
  overrideBuilt = false;
  overrideConfig = undefined;

  endManaged(cachedConnection, true);
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
  endManaged(overrideConnection, overrideBuilt);
  endManaged(cachedConnection, true);
  overrideConnection = undefined;
  overrideBuilt = false;
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
  endManaged(cachedConnection, true);
  cachedConnection = undefined;
  cachedConfigSignature = undefined;
  // Also invalidate override connection if it exists
  if (overrideConnection) {
    endManaged(overrideConnection, overrideBuilt);
    overrideConnection = undefined;
    overrideBuilt = false;
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

export async function makeAdtRequest(
  connection: IAbapConnection,
  url: string,
  method: string,
  timeout: number,
  data?: unknown,
  params?: IAbapRequestOptions['params'],
  headers?: Record<string, string>,
): Promise<IAdtWireResponse> {
  return connection.makeAdtRequest({
    url,
    method,
    timeout,
    data,
    params,
    headers,
  });
}

/**
 * Get system information from SAP ADT
 * Returns the system context resolved during connection init, as the current
 * request sees it (see getStatedSystemContext)
 */
export async function getSystemInformation(): Promise<{
  systemID?: string;
  userName?: string;
} | null> {
  const { getStatedSystemContext } = await import('./systemContext.js');
  const ctx = getStatedSystemContext();
  if (!ctx.masterSystem && !ctx.responsible) return null;
  return { systemID: ctx.masterSystem, userName: ctx.responsible };
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
      const connectionConfig = hasMethod(cachedConnection, 'getConfig')
        ? cachedConnection.getConfig()
        : undefined;
      if (connectionConfig) {
        return child(connectionConfig, 'authType') === 'jwt';
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
 * @param response - AxiosResponse from validation endpoint
 * @returns Parsed validation result with valid, severity, message, exists fields
 */
/** What `parseValidationResponse` answers. */
interface ValidationReading {
  valid: boolean;
  severity?: string;
  message?: string;
  longText?: string;
  exists?: boolean;
}

/**
 * A validation answer read from its status and its text alone: what
 * `parseValidationResponse` answers when the document cannot be read.
 */
function validationFromStatus(response: {
  data: unknown;
  status: number;
}): ValidationReading {
  if (response.status === 200) {
    return { valid: true };
  }
  // If parsing fails and status is not 200, try to extract error message from response.data
  let errorMessage = `Validation failed with status ${response.status}`;

  // Try to extract error details from response data (plain text or XML)
  if (response.data) {
    const dataStr =
      typeof response.data === 'string' ? response.data : String(response.data);
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

export function parseValidationResponse(response: {
  data: unknown;
  status: number;
}): ValidationReading {
  // A document this reading cannot take apart — not XML, or a field that is
  // not text where text is read — is answered from the status and the text.
  let result: unknown;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    result = parser.parse(xmlTextOf(response.data));
  } catch (_error) {
    return validationFromStatus(response);
  }

  // Check for exception format (<exc:exception>)
  const exception = child(result, 'exc:exception');
  if (exception) {
    const message = child(exception, 'message') || '';
    const localizedMessage = child(exception, 'localizedMessage') || message;
    const msgText = localizedMessage || message;
    if (typeof msgText !== 'string') return validationFromStatus(response);
    const msgLower = msgText.toLowerCase();

    // Check exception type - ExceptionResourceAlreadyExists means object exists
    const exceptionType = child(exception, 'type') || '';
    const isResourceAlreadyExists =
      exceptionType === 'ExceptionResourceAlreadyExists' ||
      (typeof exceptionType === 'string' &&
        (exceptionType.includes('ResourceAlreadyExists') ||
          exceptionType.includes('AlreadyExists')));
    if (!isResourceAlreadyExists && typeof exceptionType !== 'string') {
      return validationFromStatus(response);
    }

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
  const data = childAt(result, 'asx:abap', 'asx:values', 'DATA');
  if (!data) {
    // No data means validation passed
    return { valid: true };
  }

  // Check for CHECK_RESULT=X (success)
  if (child(data, 'CHECK_RESULT') === 'X') {
    return { valid: true };
  }

  // Check for SEVERITY (error/warning)
  const severity = child(data, 'SEVERITY');
  const shortText = child(data, 'SHORT_TEXT') || '';
  const longText = child(data, 'LONG_TEXT') || '';
  if (typeof shortText !== 'string') return validationFromStatus(response);

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
    severity: severity === undefined ? undefined : String(severity),
    message: shortText,
    longText: String(longText),
    exists: exists || undefined,
  };
}

/**
 * Check if error message indicates object was already checked
 * Used to handle "has been checked" / "was checked" messages as non-critical
 * @param error - Error object or error message string
 * @returns true if error indicates object was already checked
 */
export function isAlreadyCheckedError(error: unknown): boolean {
  const errorMessage = String(
    child(error, 'message') || child(error, 'text') || String(error || ''),
  );
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
export function isAlreadyExistsError(error: unknown): boolean {
  const errorMessage = String(
    child(error, 'message') || child(error, 'text') || String(error || ''),
  );
  const data = childAt(error, 'response', 'data');
  const responseData =
    typeof data === 'string' ? data : data ? JSON.stringify(data) : '';
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
  logger?: { debug?: (message: string, data?: unknown) => void },
): Promise<T> {
  try {
    return await checkOperation();
  } catch (checkError) {
    if (isAlreadyCheckedError(checkError)) {
      // Object was already checked - this is OK, continue
      if (logger?.debug) {
        logger?.debug(
          `${objectName} was already checked - this is OK, continuing`,
        );
      }
      // Return a mock success response or rethrow with handled flag
      // For now, we'll rethrow but mark it as handled
      const handledError = Object.assign(
        new Error(`Object ${objectName} was already checked`),
        { isAlreadyChecked: true },
      );
      throw handledError;
    }
    // Real check error - rethrow
    throw checkError;
  }
}
export interface ServerOptions {
  sapConfig?: SapConfig;
  connection?: IAbapConnection;
  allowProcessExit?: boolean;
  registerSignalHandlers?: boolean;
}

export function setSapConfigOverride(config?: SapConfig) {
  setConfigOverride(config);
}

export function setAbapConnectionOverride(connection?: IAbapConnection) {
  setConnectionOverride(connection);
}

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
      const debugFile = join(process.cwd(), 'mcp-debug.log');
      appendFileSync(
        debugFile,
        `${new Date().toISOString()} ${message}`,
        'utf8',
      );
    } catch (_e) {
      // Ignore file write errors
    }
  }
}

// **No contract re-export here, and it is deliberate.** This line used to be
// `export * from '@mcp-abap-adt/interfaces'`, described as re-exporting the
// header constants. Those constants live in `@mcp-abap-adt/interfaces-network`
// since the contract split, and measured before removing it: nothing in this
// repository imported one through here, and the one consumer that uses them —
// cloud-llm-hub — imports them from the contract package directly. A star
// re-export also decides for a consumer WHICH version of the contract they
// compile against, which is the coupling the split was made to end.
//
// A named re-export can be added here the day something actually needs one.
export type { IAdtSystemContext } from './systemContext.js';
// Re-export safe system context accessors for consumers (no HTTP, no connection mutation)
export { getSystemContext, setSystemContext } from './systemContext.js';

/** What the summary says of a value it holds: that it is there. */
const PRESENT = 'set';

/**
 * Format auth configuration for display at server startup
 * Shows connection details; a secret is shown by its presence only (`set`),
 * never by a character of it
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
 * @param source - Source of the config (e.g., an .env file name, 'service-key')
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
      lines.push(`║  Password:      ${PRESENT.padEnd(45)}║`);
    }
  }

  if (config.authType === 'jwt') {
    if (config.jwtToken) {
      lines.push(`║  JWT Token:     ${PRESENT.padEnd(45)}║`);
    }
    if (config.refreshToken) {
      lines.push(`║  Refresh Token: ${PRESENT.padEnd(45)}║`);
    }
    if (config.uaaUrl) {
      const uaaUrl =
        config.uaaUrl.length > 45
          ? config.uaaUrl.substring(0, 42) + '...'
          : config.uaaUrl;
      lines.push(`║  UAA URL:       ${uaaUrl.padEnd(45)}║`);
    }
    if (config.uaaClientId) {
      lines.push(`║  UAA Client ID: ${PRESENT.padEnd(45)}║`);
    }
    if (config.uaaClientSecret) {
      lines.push(`║  UAA Secret:    ${PRESENT.padEnd(45)}║`);
    }
  }

  lines.push(
    '╚══════════════════════════════════════════════════════════════╝',
  );

  return lines.join('\n');
}

/** What fast-xml-parser reads of `value`: its text, as `parse` reads it. */
function xmlTextOf(value: unknown): string | Uint8Array {
  if (typeof value === 'string' || value instanceof Uint8Array) return value;
  if (value === undefined || value === null) {
    throw new TypeError('XML data is accepted in String or Bytes[] form.');
  }
  return String(value);
}

/** An attribute that reads `true`, as text or as a parsed boolean. */
function isTrue(value: unknown): boolean {
  return value === 'true' || value === true;
}

export function parseActivationResponse(responseData: unknown) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: true,
  });

  try {
    const data =
      typeof responseData === 'string'
        ? responseData
        : child(responseData, 'data') || JSON.stringify(responseData);
    const result: unknown = parser.parse(xmlTextOf(data));
    const properties = childAt(result, 'chkl:messages', 'chkl:properties');
    const activated = isTrue(child(properties, '@_activationExecuted'));
    const checked = isTrue(child(properties, '@_checkExecuted'));
    const generated = isTrue(child(properties, '@_generationExecuted'));
    const messages: Array<{
      type: string;
      text: string;
      line?: number;
      column?: number;
    }> = [];
    const numberOrNone = (value: unknown) =>
      typeof value === 'number' ? value : undefined;
    const msgData = childAt(result, 'chkl:messages', 'msg');
    if (msgData) {
      for (const msg of listOf(msgData)) {
        const shortText = child(msg, 'shortText');
        messages.push({
          type: String(child(msg, '@_type') || 'info'),
          text: String(
            child(shortText, 'txt') || shortText || 'Unknown message',
          ),
          line: numberOrNone(child(msg, '@_line')),
          column: numberOrNone(child(msg, '@_column')),
        });
      }
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
