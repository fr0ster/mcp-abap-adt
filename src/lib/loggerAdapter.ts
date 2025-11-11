/**
 * Logger adapter that wraps the server logger to implement ILogger interface
 * from @mcp-abap-adt/connection package
 */
import { ILogger } from "@mcp-abap-adt/connection";
import { logger } from "./logger";

/**
 * Adapter that implements ILogger interface using the server's logger
 */
export const loggerAdapter: ILogger = {
  info: (message: string, meta?: any) => {
    logger.info(message, meta);
  },
  error: (message: string, meta?: any) => {
    logger.error(message, meta);
  },
  warn: (message: string, meta?: any) => {
    logger.warn(message, meta);
  },
  debug: (message: string, meta?: any) => {
    logger.debug(message, meta);
  },
  csrfToken: (action: "fetch" | "retry" | "success" | "error", message: string, meta?: any) => {
    // Map action to type for server logger
    const type = action === "retry" ? "retry" : action;
    logger.csrfToken(type, message, meta);
  },
  tlsConfig: (rejectUnauthorized: boolean) => {
    logger.tlsConfig(rejectUnauthorized);
  },
};

