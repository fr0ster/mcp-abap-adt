/**
 * Configuration interface for AuthBrokerFactory
 * Different server versions can implement their own config that conforms to this
 */

import type { ILogger } from "@mcp-abap-adt/interfaces";

export interface IAuthBrokerFactoryConfig {
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
  /** Transport type */
  transportType: string;
  /** Use auth-broker instead of .env file */
  useAuthBroker?: boolean;
  /** Port for browser auth callback server (to avoid conflicts with SSE/HTTP servers) */
  browserAuthPort?: number;
  /** Logger instance */
  logger?: ILogger;
}
