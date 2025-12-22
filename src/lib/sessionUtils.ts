/**
 * Session Management Utilities for SAP ADT Stateful Operations
 *
 * This module provides centralized utilities for managing stateful sessions
 * when interacting with SAP ADT (ABAP Development Tools) API.
 *
 * Key concepts:
 * - Session ID (sap-adt-connection-id): Unique identifier for the entire operation
 *   Must be the SAME for all requests (LOCK → PUT → UNLOCK) within one operation
 *
 * - Request ID (sap-adt-request-id): Unique identifier for each individual request
 *   Must be DIFFERENT for every request within a session
 *
 * - Stateful Session: Required for operations that modify ABAP objects
 *   (create/update source code, lock management, transport handling)
 *
 * Usage:
 * ```typescript
 * import { generateSessionId, makeAdtRequestWithSession } from '../lib/sessionUtils';
 *
 * const sessionId = generateSessionId();
 *
 * // All requests use the same sessionId
 * await makeAdtRequestWithSession(lockUrl, 'POST', sessionId);
 * await makeAdtRequestWithSession(putUrl, 'PUT', sessionId, sourceCode);
 * await makeAdtRequestWithSession(unlockUrl, 'POST', sessionId);
 * ```
 *
 * @see doc/architecture/STATEFUL_SESSION_GUIDE.md for detailed documentation
 */

import * as crypto from 'node:crypto';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces';
import type { AxiosResponse } from 'axios';
import { makeAdtRequestWithTimeout } from './utils';

/**
 * Generate unique session ID for ADT stateful operations
 *
 * This ID must be used consistently across all requests within a single operation
 * (e.g., LOCK → PUT → UNLOCK sequence). Using different session IDs will cause
 * "invalid lock handle" errors.
 *
 * Format: 32-character hexadecimal string (UUID without hyphens)
 * Example: "a1b2c3d4e5f67890123456789abcdef0"
 *
 * @returns Unique session ID for sap-adt-connection-id header
 */
export function generateSessionId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * Generate unique request ID for each individual ADT request
 *
 * Each request within a session must have a different request ID.
 * This is used for tracking and debugging purposes.
 *
 * Format: 32-character hexadecimal string (UUID without hyphens)
 * Example: "f0e1d2c3b4a5968778695a4b3c2d1e0f"
 *
 * @returns Unique request ID for sap-adt-request-id header
 */
export function generateRequestId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * Make ADT request with stateful session management
 *
 * This is a wrapper around makeAdtRequestWithTimeout that automatically adds
 * the required headers for stateful ADT operations:
 * - sap-adt-connection-id: Session identifier (must be same for all requests)
 * - sap-adt-request-id: Request identifier (must be unique for each request)
 * - x-sap-adt-sessiontype: "stateful" (declares stateful session mode)
 * - X-sap-adt-profiling: "server-time" (optional performance profiling)
 *
 * CRITICAL RULES:
 * 1. Use the SAME sessionId for all requests in one operation (LOCK/PUT/UNLOCK)
 * 2. Each call to this function generates a NEW unique request ID automatically
 * 3. Cookies are managed automatically by BaseAbapConnection
 * 4. Always unlock in try/finally block to prevent orphaned locks
 *
 * @param url - ADT API endpoint URL (can be relative or absolute)
 * @param method - HTTP method ('GET', 'POST', 'PUT', 'DELETE')
 * @param sessionId - Session ID from generateSessionId() - MUST be same for all related requests
 * @param data - Optional request body (source code, XML payload, etc.)
 * @param additionalHeaders - Optional custom headers to merge with session headers
 * @returns Promise with Axios response
 *
 * @example
 * ```typescript
 * // Create one session ID for the entire operation
 * const sessionId = generateSessionId();
 *
 * // Step 1: Lock object
 * const lockResponse = await makeAdtRequestWithSession(
 *   '/sap/bc/adt/oo/classes/zcl_test?_action=LOCK',
 *   'POST',
 *   sessionId,
 *   null,
 *   { 'Accept': 'application/vnd.sap.as+xml' }
 * );
 *
 * // Step 2: Update source (same sessionId!)
 * await makeAdtRequestWithSession(
 *   `/sap/bc/adt/oo/classes/zcl_test/source/main?lockHandle=${handle}`,
 *   'PUT',
 *   sessionId,
 *   sourceCode,
 *   { 'Content-Type': 'text/plain; charset=utf-8' }
 * );
 *
 * // Step 3: Unlock (same sessionId!)
 * await makeAdtRequestWithSession(
 *   `/sap/bc/adt/oo/classes/zcl_test?_action=UNLOCK&lockHandle=${handle}`,
 *   'POST',
 *   sessionId
 * );
 * ```
 */
export async function makeAdtRequestWithSession(
  connection: IAbapConnection,
  url: string,
  method: string,
  sessionId: string,
  data?: any,
  additionalHeaders?: Record<string, string>,
): Promise<AxiosResponse> {
  // Resolve to full URL if relative path provided
  const baseUrl = await connection.getBaseUrl();
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;

  // Generate unique request ID for this specific request
  const requestId = generateRequestId();

  // Build headers with stateful session identifiers
  const headers: Record<string, string> = {
    'sap-adt-connection-id': sessionId, // Same for all requests in operation
    'sap-adt-request-id': requestId, // Unique for this request
    'x-sap-adt-sessiontype': 'stateful', // Declares stateful session
    'X-sap-adt-profiling': 'server-time', // Performance profiling
    ...additionalHeaders, // Merge any custom headers
  };

  // Make request using standard timeout handling
  return makeAdtRequestWithTimeout(
    connection,
    fullUrl,
    method,
    'default',
    data,
    undefined,
    headers,
  );
}

/**
 * Make ADT request with stateless session (for operations that don't require lock management)
 *
 * Similar to makeAdtRequestWithSession but omits the 'x-sap-adt-sessiontype: stateful' header.
 * Used for operations that don't involve locking but still need session tracking.
 *
 * @param url - ADT API endpoint URL
 * @param method - HTTP method
 * @param sessionId - Session ID for tracking purposes
 * @param data - Optional request body
 * @param additionalHeaders - Optional custom headers
 * @returns Promise with Axios response
 */
export async function makeAdtRequestStateless(
  connection: IAbapConnection,
  url: string,
  method: string,
  sessionId: string,
  data?: any,
  additionalHeaders?: Record<string, string>,
): Promise<AxiosResponse> {
  const baseUrl = await connection.getBaseUrl();
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;

  const requestId = generateRequestId();
  const headers: Record<string, string> = {
    'sap-adt-connection-id': sessionId,
    'sap-adt-request-id': requestId,
    'X-sap-adt-profiling': 'server-time',
    ...additionalHeaders,
  };

  return makeAdtRequestWithTimeout(
    connection,
    fullUrl,
    method,
    'default',
    data,
    undefined,
    headers,
  );
}
