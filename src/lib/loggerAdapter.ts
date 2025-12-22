/**
 * Logger adapter that wraps the server logger to implement ILogger interface
 * from @mcp-abap-adt/interfaces package
 */
import type { ILogger } from '@mcp-abap-adt/interfaces';
import { logger } from './logger';

/**
 * Adapter that implements ILogger interface using the server's logger
 *
 * Note: The ILogger interface only includes basic logging methods (info, error, warn, debug).
 * Additional methods like csrfToken and tlsConfig are handled by the server logger directly
 * and are not part of the ILogger interface.
 */
export const loggerAdapter: ILogger = {
  info: (message: string, meta?: any) => {
    logger?.info(message, meta);
  },
  error: (message: string, meta?: any) => {
    logger?.error(message, meta);
  },
  warn: (message: string, meta?: any) => {
    logger?.warn(message, meta);
  },
  debug: (message: string, meta?: any) => {
    logger?.debug(message, meta);
  },
};
