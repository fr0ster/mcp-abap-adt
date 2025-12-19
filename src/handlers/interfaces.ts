import { AbapConnection } from "@mcp-abap-adt/connection";
import type { ILogger } from "@mcp-abap-adt/interfaces";

/**
 * Handler context containing connection and logger
 * Injected automatically by BaseMcpServer.registerHandlers()
 */
export interface HandlerContext {
  connection: AbapConnection;
  logger?: ILogger;
}
