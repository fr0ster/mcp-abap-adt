import type { Logger } from '@mcp-abap-adt/logger';
import { testLogger } from '@mcp-abap-adt/logger';

const ENABLE_TEST_LOGS = process.env.DEBUG_TESTS === 'true' || process.env.DEBUG_ADT_TESTS === 'true';

const noop = () => {};
const noopLogger: Logger = {
  info: noop,
  debug: noop,
  warn: noop,
  error: noop,
  browserAuth: noop,
  refresh: noop,
  success: noop,
  browserUrl: noop,
  browserOpening: noop,
  testSkip: noop,
};

/**
 * Create a prefixed test logger for integration tests.
 * Prefix helps distinguish categories (test/class/auth/connection/etc.).
 */
export function createTestLogger(category: string): Logger {
  if (!ENABLE_TEST_LOGS) {
    return noopLogger;
  }

  const prefix = `[${category}]`;
  const wrap = (fn: (msg: string) => void) => (msg: string) => fn(`${prefix} ${msg}`);

  return {
    info: wrap(testLogger.info.bind(testLogger)),
    debug: wrap(testLogger.debug.bind(testLogger)),
    warn: wrap(testLogger.warn.bind(testLogger)),
    error: wrap(testLogger.error.bind(testLogger)),
    browserAuth: wrap(testLogger.browserAuth.bind(testLogger)),
    refresh: wrap(testLogger.refresh.bind(testLogger)),
    success: wrap(testLogger.success.bind(testLogger)),
    browserUrl: wrap(testLogger.browserUrl.bind(testLogger)),
    browserOpening: wrap(testLogger.browserOpening.bind(testLogger)),
    testSkip: wrap(testLogger.testSkip.bind(testLogger)),
  };
}

/**
 * Helper to log structured object actions in tests.
 */
export function logObjectAction(logger: Logger, action: string, objectName: string, extra?: Record<string, any>) {
  const payload = extra ? ` ${JSON.stringify(extra)}` : '';
  logger.info(`${action} ${objectName}${payload}`);
}
