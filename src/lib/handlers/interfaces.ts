/**
 * Handler Interfaces
 *
 * Defines interfaces for handlers, including HandlerContext
 */

import type { ILogger, IAbapConnection } from '@mcp-abap-adt/interfaces';

/**
 * Handler context passed to all handlers
 * Contains connection and logger for handler operations
 */
export interface HandlerContext {
  connection: IAbapConnection;
  logger: ILogger;
}
