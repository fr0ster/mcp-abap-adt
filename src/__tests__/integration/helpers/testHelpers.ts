/**
 * Test helpers for low-level handler integration tests
 * Provides utilities for parsing responses, managing sessions, etc.
 */

import { AxiosError } from 'axios';
import { isAlreadyCheckedError, isAlreadyExistsError } from '../../../lib/utils';

/**
 * Parse handler response content
 */
export function parseHandlerResponse(response: { isError: boolean; content: Array<{ type: string; text: string }> }): any {
  if (response.isError) {
    throw new Error(`Handler returned error: ${response.content[0]?.text || 'Unknown error'}`);
  }

  const text = response.content[0]?.text;
  if (!text) {
    throw new Error('Handler response has no content');
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse handler response: ${e}`);
  }
}

/**
 * Extract session state from handler response
 */
export function extractSessionState(response: any): { session_id: string | null; session_state: any } {
  return {
    session_id: response.session_id || null,
    session_state: response.session_state || null
  };
}

/**
 * Extract lock handle from Lock handler response
 */
export function extractLockHandle(response: any): string {
  if (!response.lock_handle) {
    throw new Error('Lock response does not contain lock_handle');
  }
  return response.lock_handle;
}

/**
 * Safely extract error message from handler error response
 */
export function extractErrorMessage(response: { isError: boolean; content: Array<{ type: string; text: string }> }): string {
  if (!response.isError) {
    return '';
  }

  const text = response.content[0]?.text || 'Unknown error';
  // Remove "Error: " prefix if present
  return text.replace(/^Error:\s*/, '');
}

/**
 * Check if handler response indicates success
 */
export function isSuccessResponse(response: any): boolean {
  return response.success === true && !response.isError;
}

/**
 * Wait for a specified delay (for SAP operation processing)
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safely stringify an object, handling circular references
 */
export function safeStringify(obj: any): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
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
  });
}

/**
 * Debug logging helper for integration tests
 * Enabled via DEBUG_TESTS=true environment variable
 *
 * Usage:
 *   import { debugLog } from '../helpers/testHelpers';
 *   debugLog('STEP', 'Message', { data: 'value' });
 */
export const DEBUG_TESTS = process.env.DEBUG_TESTS === 'true';

export function debugLog(step: string, message: string, data?: any): void {
  if (DEBUG_TESTS) {
    console.log(`[DEBUG] ${step}: ${message}`);
    if (data !== undefined && data !== null) {
      console.log(`[DEBUG] ${step} data:`, JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Check if error message indicates object was already checked
 * Re-exports from lib/utils for use in tests
 */
export { isAlreadyCheckedError };

/**
 * Check if error message indicates object already exists
 * Re-exports from lib/utils for use in tests
 */
export { isAlreadyExistsError };

/**
 * Safely handle check operation response - ignores "already checked" errors
 * @param checkResponse - Handler response from check operation
 * @param objectName - Name of object being checked (for error messages)
 * @throws Error if check failed with a real error (not "already checked")
 */
export function handleCheckResponse(
  checkResponse: { isError: boolean; content: Array<{ type: string; text: string }> },
  objectName: string
): void {
  if (!checkResponse.isError) {
    return; // Success
  }

  const errorMsg = extractErrorMessage(checkResponse);

  // "Already checked" is not an error - it's OK, just return
  if (isAlreadyCheckedError(errorMsg)) {
    return; // Already checked is OK
  }

  // Real error - throw
  throw new Error(`Check failed for ${objectName}: ${errorMsg}`);
}

/**
 * Safely handle validation response - checks if object already exists
 * @param validateResponse - Handler response from validation
 * @param validateData - Parsed validation data (can be null if validation failed)
 * @param objectName - Name of object being validated
 * @returns true if object exists (should skip test), false if should continue
 */
export function shouldSkipDueToExistingObject(
  validateResponse: { isError: boolean; content: Array<{ type: string; text: string }> },
  validateData: any | null,
  objectName: string
): boolean {
  // Check error message first
  if (validateResponse.isError) {
    const errorMsg = extractErrorMessage(validateResponse);
    if (isAlreadyExistsError(errorMsg)) {
      return true;
    }
  }

  // Check validation result if data is available
  if (validateData && !validateData.validation_result?.valid) {
    const message = validateData.validation_result?.message || '';
    const indicatesExists = validateData.validation_result?.exists ||
                           isAlreadyExistsError(message);
    return indicatesExists;
  }

  return false;
}

