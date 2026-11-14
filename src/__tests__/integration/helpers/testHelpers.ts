/**
 * Test helpers for low-level handler integration tests
 * Provides utilities for parsing responses, managing sessions, etc.
 */

import assert from 'node:assert/strict';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { AxiosError } from 'axios';
import type * as z from 'zod';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { type JsonValue, parseJson } from '../../../lib/json';
import { HeldLocks } from '../../../lib/state/heldLocks';
import type { LoggerWithExtras } from './loggerHelpers';
import { createTestLogger } from './loggerHelpers';

/**
 * Parse handler response content
 */
export function parseHandlerResponse(response: {
  isError: boolean;
  content: Array<{ type: string; text: string }>;
}): JsonValue {
  if (response.isError) {
    throw new Error(
      `Handler returned error: ${response.content[0]?.text || 'Unknown error'}`,
    );
  }

  const text = response.content[0]?.text;
  if (!text) {
    throw new Error('Handler response has no content');
  }

  const parsed = parseJson(text);
  if (parsed === undefined) {
    throw new Error(`Failed to parse handler response: ${text.slice(0, 200)}`);
  }
  return parsed;
}

/**
 * A handler's answer as `schema` reads it: the JSON it answered, checked
 * once against what the test reads of it.
 */
export function handlerAnswer<S extends z.ZodType>(
  response: {
    isError: boolean;
    content: Array<{ type: string; text: string }>;
  },
  schema: S,
): z.output<S> {
  return schema.parse(parseHandlerResponse(response));
}

/** `value`'s own `key`, when `value` is an object; parsed JSON is read by shape. */
function fieldOf(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value
    ? Reflect.get(value, key)
    : undefined;
}

/**
 * Assert a write was accepted, for a handler whose terse projection answers
 * the bare word rather than a document.
 *
 * `terseWrite` (`src/lib/strategies/projections.ts`) answers the string
 * `SUCCESS` for any 2xx and `undefined` otherwise, so a create, an update or
 * an unlock has no JSON body to parse at the default `detail`. Reaching for
 * `parseHandlerResponse` on one of these throws
 * `Unexpected token 'S', "SUCCESS" is not valid JSON` — which is a test
 * reading the old envelope, not a handler defect.
 *
 * **An accepted write is not a completed one.** ADT is asynchronous: this
 * says the parameters were valid and the task was taken, and nothing more.
 * What the object looks like afterwards is a question for a read or an
 * activation.
 */
export function expectWriteAccepted(response: {
  isError: boolean;
  content: Array<{ type: string; text: string }>;
}): void {
  if (response.isError) {
    throw new Error(
      `Handler returned error: ${response.content[0]?.text || 'Unknown error'}`,
    );
  }
  assert.equal(response.content[0]?.text, 'SUCCESS');
}

/**
 * Extract session state from handler response
 */
export function extractSessionState(response: unknown): {
  session_id: string | null;
  session_state: { cookies: string } | null;
} {
  const sessionId = fieldOf(response, 'session_id');
  const state = fieldOf(response, 'session_state');
  const cookies = fieldOf(state, 'cookies');
  return {
    session_id: typeof sessionId === 'string' && sessionId ? sessionId : null,
    session_state: typeof cookies === 'string' ? { cookies } : null,
  };
}

/**
 * Extract lock handle from Lock handler response
 */
export function extractLockHandle(response: unknown): string {
  const lockHandle = fieldOf(response, 'lock_handle');
  if (typeof lockHandle !== 'string' || !lockHandle) {
    throw new Error('Lock response does not contain lock_handle');
  }
  return lockHandle;
}

/**
 * Safely extract error message from handler error response
 */
export function extractErrorMessage(response: {
  isError: boolean;
  content: Array<{ type: string; text: string }>;
}): string {
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
export function isSuccessResponse(response: unknown): boolean {
  return fieldOf(response, 'success') === true && !fieldOf(response, 'isError');
}

/**
 * Wait for a specified delay (for SAP operation processing)
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safely stringify an object, handling circular references
 */
export function safeStringify(obj: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
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
  });
}

/**
 * Debug logging helper for integration tests
 * Enabled via DEBUG_TESTS=true or DEBUG_ADT_TESTS=true environment variable
 *
 * Usage:
 *   import { debugLog } from '../helpers/testHelpers';
 *   debugLog('STEP', 'Message', { data: 'value' });
 */
export const DEBUG_TESTS =
  process.env.DEBUG_TESTS === 'true' || process.env.DEBUG_ADT_TESTS === 'true';
const testLogger = createTestLogger('test');

export function debugLog(step: string, message: string, data?: unknown): void {
  if (!DEBUG_TESTS) return;

  testLogger?.debug(`${step}: ${message}`);
  if (data !== undefined && data !== null) {
    testLogger?.debug(`${step} data: ${JSON.stringify(data, null, 2)}`);
  }
}

/**
 * Log test step in simple format (like adt-clients tests)
 * Enabled via DEBUG_TESTS=true or DEBUG_ADT_TESTS=true environment variable
 *
 * Usage:
 *   import { logTestStep } from '../helpers/testHelpers';
 *   logTestStep('validate');
 *   logTestStep('create');
 *   logTestStep('check(active)');
 */
function logImmediate(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function logTestStep(step: string): void {
  if (DEBUG_TESTS) {
    logImmediate(`  → ${step}...`);
  }
}

/**
 * Create HandlerContext from TesterContext
 * Logger is included only if DEBUG_HANDLERS=true
 *
 * @param context - TesterContext from workflow function
 * @returns HandlerContext with connection and optional logger
 */
export function createHandlerContext(context: {
  connection: IAbapConnection;
  logger: LoggerWithExtras;
}): HandlerContext {
  // The context stands for a server instance: its own `HandlerLock` keeps
  // the handles it took, and a write, a delete or an unlock is sent only
  // under one of them (#4) — without an owner every compact lock is refused.
  const handlerContext: HandlerContext = {
    connection: context.connection,
    heldLocks: new HeldLocks(),
  };

  // Include logger only if DEBUG_HANDLERS is enabled
  if (process.env.DEBUG_HANDLERS === 'true') {
    handlerContext.logger = context.logger as unknown as ILogger;
  }

  return handlerContext;
}
