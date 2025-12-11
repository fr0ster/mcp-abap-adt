const fs = require('fs');
const path = require('path');
const { LogLevel } = require('@mcp-abap-adt/logger');

process.env.MCP_SKIP_AUTO_START = "true";

const DEBUG_ENVS_ENABLED =
  process.env.DEBUG_TESTS === 'true' ||
  process.env.DEBUG_ADT_TESTS === 'true' ||
  process.env.DEBUG_CONNECTORS === 'true';
const COLORIZE = process.env.TEST_LOG_COLOR === 'true';

function resolveLogLevel() {
  const explicit = process.env.TEST_LOG_LEVEL && process.env.TEST_LOG_LEVEL.toLowerCase();
  if (explicit === 'error') return LogLevel.ERROR;
  if (explicit === 'warn') return LogLevel.WARN;
  if (explicit === 'debug') return LogLevel.DEBUG;
  if (explicit === 'info') return LogLevel.INFO;
  if (DEBUG_ENVS_ENABLED) return LogLevel.DEBUG;
  return LogLevel.INFO;
}

function createFileSinkAppender() {
  const filePath = process.env.TEST_LOG_FILE;
  if (!filePath) return null;

  const dir = path.dirname(filePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return null;
  }

  return line => {
    try {
      fs.appendFileSync(filePath, `${line}\n`);
    } catch {
      // best-effort; ignore file errors
    }
  };
}

const appendToFile = createFileSinkAppender();
const resolvedLogLevel = process.env.TEST_LOG_SILENT === 'true' ? null : resolveLogLevel();
const prefix = (() => {
  if (!COLORIZE) return '[test]';
  const cyan = '\x1b[36m';
  const reset = '\x1b[0m';
  return `${cyan}[TST]${reset}`;
})();
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const emit = (messageLevel, sink) => (...args) => {
  if (resolvedLogLevel === null || resolvedLogLevel < messageLevel) return;
  const line = `${prefix} ${args.map(v => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ')}`;
  sink(line);
  if (appendToFile) {
    appendToFile(`[${new Date().toISOString()}] ${line}`);
  }
};

const info = emit(LogLevel.INFO, msg => originalConsole.info(msg));
const debug = emit(LogLevel.DEBUG, msg => originalConsole.info(msg.startsWith('[DEBUG]') ? msg : `[DEBUG] ${msg}`));
const warn = emit(LogLevel.WARN, msg => originalConsole.warn(msg.startsWith('[WARN]') ? msg : `[WARN] ${msg}`));
const error = emit(LogLevel.ERROR, msg => originalConsole.error(msg));

// Route all ad-hoc console usage through the test logger pipeline
console.log = info;
console.info = info;
console.debug = debug;
console.warn = warn;
console.error = error;
