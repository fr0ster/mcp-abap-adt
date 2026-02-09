import { createRequire } from 'node:module';
import type { Logger } from '@mcp-abap-adt/logger';

/**
 * Create a prefixed logger for handlers.
 * Honors AUTH_LOG_LEVEL from @mcp-abap-adt/logger; set to "error"/"warn"/"info"/"debug".
 * Use HANDLER_LOG_SILENT=true to force no-op logger for handlers.
 */
export function getHandlerLogger(
  category: string,
  baseLogger?: Logger,
): Logger {
  if (process.env.HANDLER_LOG_SILENT === 'true') {
    return noopLogger;
  }
  const resolvedLogger = baseLogger ?? getDefaultLogger();
  const prefix = `[${category}]`;
  const wrap = (fn: (msg: string) => void) => (msg: string) =>
    fn(`${prefix} ${msg}`);

  return {
    info: wrap(resolvedLogger?.info.bind(resolvedLogger)),
    debug: wrap(resolvedLogger?.debug.bind(resolvedLogger)),
    warn: wrap(resolvedLogger?.warn.bind(resolvedLogger)),
    error: wrap(resolvedLogger?.error.bind(resolvedLogger)),
  };
}

const noopFn = () => {};
export const noopLogger: Logger = {
  info: noopFn,
  debug: noopFn,
  warn: noopFn,
  error: noopFn,
};

function getDefaultLogger(): Logger {
  const require = createRequire(__filename);
  const mod = require('@mcp-abap-adt/logger');
  return mod.defaultLogger ?? new mod.DefaultLogger();
}
