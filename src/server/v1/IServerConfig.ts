/**
 * V1 Server configuration
 * Re-exports unified IServerConfig from lib/config
 */

// Re-export types from unified config
export type { Transport, HandlerSet, IServerConfig } from "../../lib/config/IServerConfig.js";

// Re-export TransportConfig for backward compatibility
export type { TransportConfig } from "../../lib/utils.js";

// For backward compatibility with v1 code that expects required transport
import type { IServerConfig as IBaseServerConfig } from "../../lib/config/IServerConfig.js";
import type { TransportConfig } from "../../lib/utils.js";

/**
 * V1 Server configuration with required transportConfig
 * @deprecated Use IServerConfig from lib/config/IServerConfig.js
 */
export interface IV1ServerConfig extends IBaseServerConfig {
  /** Transport configuration (v1 style, complex object) */
  transportConfig: TransportConfig;
}
