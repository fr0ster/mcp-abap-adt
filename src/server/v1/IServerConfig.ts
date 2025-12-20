/**
 * V1 Server configuration
 */

import { TransportConfig } from "../../lib/utils.js";
import { IServerConfig as IBaseServerConfig } from "../../lib/config/IServerConfig.js";

export interface IServerConfig extends IBaseServerConfig {
  /** Default MCP destination (v1 specific) */
  defaultMcpDestination?: string;
  /** Default destination (from --mcp or .env) (v1 specific) */
  defaultDestination?: string;
  /** Transport configuration (v1 specific) */
  transport: TransportConfig;
  /** Logger instance (v1 specific) */
  logger?: any;
}
