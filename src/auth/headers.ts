/**
 * Authentication header utilities
 */

import { IncomingHttpHeaders } from "http";
import {
  HEADER_MCP_DESTINATION,
  HEADER_SAP_DESTINATION_SERVICE,
  HEADER_SAP_URL,
  HEADER_SAP_AUTH_TYPE,
  HEADER_SAP_JWT_TOKEN,
  HEADER_SAP_LOGIN,
} from "@mcp-abap-adt/interfaces";

/**
 * Check if request has SAP connection headers
 */
export function hasSapHeaders(headers?: IncomingHttpHeaders): boolean {
  if (!headers) {
    return false;
  }
  // Check for destination-based auth headers
  if (headers[HEADER_SAP_DESTINATION_SERVICE] || headers[HEADER_MCP_DESTINATION]) {
    return true;
  }
  // Check for direct auth headers
  const sapUrl = headers[HEADER_SAP_URL];
  const sapAuthType = headers[HEADER_SAP_AUTH_TYPE];
  return !!(sapUrl && sapAuthType);
}

/**
 * Check if connection is from localhost
 */
export function isLocalConnection(remoteAddress?: string): boolean {
  if (!remoteAddress) {
    return false;
  }
  // Check for IPv4 localhost
  if (remoteAddress === "127.0.0.1" || remoteAddress === "localhost") {
    return true;
  }
  // Check for IPv6 localhost
  if (remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1") {
    return true;
  }
  // Check if it's a loopback interface
  if (remoteAddress.startsWith("127.") || remoteAddress.startsWith("::1")) {
    return true;
  }
  return false;
}

/**
 * Extract auth headers summary for logging (redacted)
 */
export function getAuthHeadersSummary(headers?: IncomingHttpHeaders): Record<string, string | undefined> {
  if (!headers) {
    return {};
  }

  return {
    [HEADER_SAP_DESTINATION_SERVICE]: headers[HEADER_SAP_DESTINATION_SERVICE] as string | undefined
      || headers['X-SAP-Destination'] as string | undefined,
    [HEADER_MCP_DESTINATION]: headers[HEADER_MCP_DESTINATION] as string | undefined
      || headers['X-MCP-Destination'] as string | undefined,
    [HEADER_SAP_URL]: (headers[HEADER_SAP_URL] || headers['X-SAP-URL']) ? '[present]' : undefined,
    [HEADER_SAP_AUTH_TYPE]: headers[HEADER_SAP_AUTH_TYPE] as string | undefined
      || headers['X-SAP-Auth-Type'] as string | undefined,
    [HEADER_SAP_JWT_TOKEN]: (headers[HEADER_SAP_JWT_TOKEN] || headers['X-SAP-JWT-Token']) ? '[present]' : undefined,
    [HEADER_SAP_LOGIN]: (headers[HEADER_SAP_LOGIN] || headers['X-SAP-Login']) ? '[present]' : undefined,
  };
}

/**
 * Get list of SAP/MCP header keys from headers object
 */
export function getSapMcpHeaderKeys(headers?: IncomingHttpHeaders): string[] {
  if (!headers) {
    return [];
  }
  return Object.keys(headers).filter(k => {
    const lowerKey = k.toLowerCase();
    return lowerKey.startsWith('x-sap') || lowerKey.startsWith('x-mcp');
  });
}

/**
 * Sanitize token for logging (show first 6 and last 4 chars)
 */
export function sanitizeToken(token: string): string {
  if (token.length <= 10) {
    return token;
  }
  return `${token.substring(0, 6)}…${token.substring(token.length - 4)}`;
}

/**
 * Clean and validate URL format
 * @returns Cleaned URL or throws error if invalid
 */
export function cleanAndValidateUrl(url: string): string {
  let cleanedUrl = url.trim();

  // Ensure URL has protocol
  if (!/^https?:\/\//.test(cleanedUrl)) {
    throw new Error(`Invalid URL format: "${url}". Expected format: https://your-system.sap.com`);
  }

  // Normalize URL using URL object
  try {
    const urlObj = new URL(cleanedUrl);
    cleanedUrl = urlObj.href.replace(/\/$/, ''); // Remove trailing slash
    return cleanedUrl;
  } catch (urlError) {
    throw new Error(`Invalid URL: "${url}". Error: ${urlError instanceof Error ? urlError.message : urlError}`);
  }
}
