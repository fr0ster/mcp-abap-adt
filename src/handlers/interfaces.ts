import type { IAbapConnection, ILogger } from "@mcp-abap-adt/interfaces";

/**
 * Handler context containing connection and logger
 * Injected automatically by BaseMcpServer.registerHandlers()
 */
export interface HandlerContext {
  connection: IAbapConnection;
  logger?: ILogger;
}
