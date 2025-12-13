/**
 * Server lifecycle management - signal handlers and shutdown
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Server as HttpServer } from "http";
import { logger } from "../lib/logger";
import type { SseSession } from "../transport/session";
import type { TransportConfig } from "../config/transport";

/**
 * Options for lifecycle setup
 */
export interface LifecycleOptions {
  /** MCP server instance */
  mcpServer: McpServer;
  /** HTTP server instance (optional) */
  httpServer?: HttpServer;
  /** SSE sessions map */
  sseSessions: Map<string, SseSession>;
  /** Transport configuration */
  transportConfig: TransportConfig;
  /** Whether to call process.exit() on shutdown */
  allowProcessExit: boolean;
}

/**
 * Setup signal handlers for graceful shutdown
 */
export function setupSignalHandlers(
  options: LifecycleOptions,
  onShutdown: () => Promise<void>
): void {
  let shuttingDown = false;
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

  for (const signal of signals) {
    process.on(signal, () => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;

      logger.info("Received shutdown signal", {
        type: "SERVER_SHUTDOWN_SIGNAL",
        signal,
        transport: options.transportConfig.type,
      });

      void onShutdown().finally(() => {
        if (options.allowProcessExit) {
          process.exit(0);
        }
      });
    });
  }
}

/**
 * Graceful shutdown of server and all connections
 */
export async function shutdown(options: LifecycleOptions): Promise<void> {
  const { mcpServer, httpServer, sseSessions } = options;

  // Close MCP server
  try {
    await mcpServer.close();
  } catch (error) {
    logger.error("Failed to close MCP server", {
      type: "SERVER_SHUTDOWN_ERROR",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Close all SSE sessions
  for (const [sessionId, session] of sseSessions.entries()) {
    try {
      await session.transport.close();
      session.server.server.close();
      logger.debug("SSE session closed during shutdown", {
        type: "SSE_SESSION_SHUTDOWN",
        sessionId,
      });
    } catch (error) {
      logger.error("Failed to close SSE session", {
        type: "SSE_SHUTDOWN_ERROR",
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });
    }
  }
  sseSessions.clear();

  // Close HTTP server
  if (httpServer) {
    await new Promise<void>((resolve) => {
      httpServer.close((closeError) => {
        if (closeError) {
          logger.error("Failed to close HTTP server", {
            type: "HTTP_SERVER_SHUTDOWN_ERROR",
            error: closeError instanceof Error ? closeError.message : String(closeError),
          });
        }
        resolve();
      });
    });
  }
}
