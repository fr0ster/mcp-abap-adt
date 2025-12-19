/**
 * Unified server configuration interface
 * Used by both old server (mcp_abap_adt_server) and new servers (StdioServer, SseServer, StreamableHttpServer)
 */

import { TransportConfig } from "../utils.js";

export interface ServerConfig {
  /** Default MCP destination from --mcp parameter */
  defaultMcpDestination?: string;
  /** Default destination (from --mcp or .env) */
  defaultDestination?: string;
  /** Path to .env file */
  envFilePath?: string;
  /** Custom path for auth broker storage */
  authBrokerPath?: string;
  /** Use unsafe mode (file-based session store) */
  unsafe: boolean;
  /** Use auth-broker instead of .env file */
  useAuthBroker: boolean;
  /** Transport configuration */
  transport: TransportConfig;
  /** Logger instance */
  logger?: any;
}

