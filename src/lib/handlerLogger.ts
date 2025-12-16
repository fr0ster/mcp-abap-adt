import type { Logger } from '@mcp-abap-adt/logger';
import { defaultLogger } from '@mcp-abap-adt/logger';

/**
 * Create a prefixed logger for handlers.
 * Honors AUTH_LOG_LEVEL from @mcp-abap-adt/logger; set to "error"/"warn"/"info"/"debug".
 * Use HANDLER_LOG_SILENT=true to force no-op logger for handlers.
 */
export function getHandlerLogger(category: string, baseLogger: Logger = defaultLogger): Logger {
  if (process.env.HANDLER_LOG_SILENT === 'true') {
    return noopLogger;
  }
  const prefix = `[${category}]`;
  const wrap = (fn: (msg: string) => void) => (msg: string) => fn(`${prefix} ${msg}`);

  return {
    info: wrap(baseLogger?.info.bind(baseLogger)),
    debug: wrap(baseLogger?.debug.bind(baseLogger)),
    warn: wrap(baseLogger?.warn.bind(baseLogger)),
    error: wrap(baseLogger?.error.bind(baseLogger)),
  };
}

const noopFn = () => {};
export const noopLogger: Logger = {
  info: noopFn,
  debug: noopFn,
  warn: noopFn,
  error: noopFn,
};
