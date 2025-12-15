import fs from 'fs';
import path from 'path';
import type { Logger } from '@mcp-abap-adt/logger';
import { LogLevel, DefaultLogger } from '@mcp-abap-adt/logger';

export type LoggerWithExtras = Logger & {
  browserAuth: (message: string) => void;
  refresh: (message: string) => void;
  success: (message: string) => void;
  browserUrl: (url: string) => void;
  browserOpening: (message: string) => void;
  testSkip: (message: string) => void;
};

const NOOP = () => {};
const noopLogger: LoggerWithExtras = {
  info: NOOP,
  debug: NOOP,
  warn: NOOP,
  error: NOOP,
  browserAuth: NOOP,
  refresh: NOOP,
  success: NOOP,
  browserUrl: NOOP,
  browserOpening: NOOP,
  testSkip: NOOP,
};

const DEBUG_ENVS_ENABLED =
  process.env.DEBUG_TESTS === 'true' ||
  process.env.DEBUG_ADT_TESTS === 'true' ||
  process.env.DEBUG_CONNECTORS === 'true';
const COLORIZE = process.env.TEST_LOG_COLOR === 'true';

function resolveLogLevel(): LogLevel {
  const explicit = process.env.TEST_LOG_LEVEL?.toLowerCase();
  if (explicit === 'error') return LogLevel.ERROR;
  if (explicit === 'warn') return LogLevel.WARN;
  if (explicit === 'debug') return LogLevel.DEBUG;
  if (explicit === 'info') return LogLevel.INFO;
  if (DEBUG_ENVS_ENABLED) return LogLevel.DEBUG;
  return LogLevel.INFO;
}

const COLORS: Record<string, string> = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
};

const CATEGORY_SHORT: Record<string, string> = {
  test: 'TST',
  connection: 'CONN',
  auth: 'AUTH',
  adt: 'ADT',
};

function formatPrefix(category: string): string {
  const short = CATEGORY_SHORT[category] || category.toUpperCase();
  if (!COLORIZE) {
    return `[${short}]`;
  }
  const color =
    category === 'test' ? COLORS.cyan :
    category === 'connection' ? COLORS.green :
    category === 'auth' ? COLORS.magenta :
    category === 'adt' ? COLORS.yellow :
    COLORS.cyan;
  return `${color}[${short}]${COLORS.reset}`;
}

function createFileSinkAppender() {
  const filePath = process.env.TEST_LOG_FILE;
  if (!filePath) {
    return null;
  }

  const dir = path.dirname(filePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore errors creating log dir; fallback to stdout-only logging
    return null;
  }

  return (line: string) => {
    try {
      fs.appendFileSync(filePath, `${line}\n`);
    } catch {
      // swallow file sink errors to avoid breaking tests
    }
  };
}

const appendToFile = createFileSinkAppender();
const resolvedLogLevel = process.env.TEST_LOG_SILENT === 'true' ? null : resolveLogLevel();

/**
 * Create a prefixed test logger for integration tests.
 * Uses DefaultLogger from @mcp-abap-adt/logger package for beautiful formatted output with icons.
 * - Honors TEST_LOG_LEVEL (error|warn|info|debug); DEBUG_* → debug.
 * - Optional file sink via TEST_LOG_FILE=/tmp/adt-tests.log.
 */
export function createTestLogger(category: string): LoggerWithExtras {
  if (resolvedLogLevel === null) {
    return noopLogger;
  }

  const level = resolvedLogLevel;
  const prefix = formatPrefix(category);
  const baseLogger = new DefaultLogger(level);

  const emit = (messageLevel: LogLevel, fn: (msg: string) => void) => (message: string) => {
    if (level < messageLevel) return;
    const line = `${prefix} ${message}`;
    fn(line);
    if (appendToFile) {
      appendToFile(`[${new Date().toISOString()}] ${line}`);
    }
  };

  const info = emit(LogLevel.INFO, msg => baseLogger.info(msg));
  const debug = emit(LogLevel.DEBUG, msg => baseLogger.debug(msg));
  const warn = emit(LogLevel.WARN, msg => baseLogger.warn(msg));
  const error = emit(LogLevel.ERROR, msg => baseLogger.error(msg));

  return {
    info,
    debug,
    warn,
    error,
    browserAuth: emit(LogLevel.INFO, msg => baseLogger.info(`🌐 ${msg}`)),
    refresh: emit(LogLevel.INFO, msg => baseLogger.info(`🔄 ${msg}`)),
    success: emit(LogLevel.INFO, msg => baseLogger.info(`✅ ${msg}`)),
    browserUrl: emit(LogLevel.INFO, msg => baseLogger.info(`🔗 ${msg}`)),
    browserOpening: emit(LogLevel.DEBUG, msg => baseLogger.debug(`🌐 ${msg}`)),
    testSkip: emit(LogLevel.INFO, msg => baseLogger.info(`⏭️  ${msg}`)),
  };
}

/**
 * Helper to log structured object actions in tests.
 */
export function logObjectAction(logger: Logger, action: string, objectName: string, extra?: Record<string, any>) {
  const payload = extra ? ` ${JSON.stringify(extra)}` : '';
  logger.info(`${action} ${objectName}${payload}`);
}
