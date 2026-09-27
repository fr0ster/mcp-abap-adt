import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';

/**
 * Handler context containing connection and logger
 * Injected automatically by BaseMcpServer.registerHandlers()
 */
export interface HandlerContext {
  connection: IAbapConnection;
  logger?: ILogger;
}
