/**
 * V2 Server configuration
 * Re-exports unified IServerConfig from lib/config
 */

// Re-export types from unified config
export type { Transport, HandlerSet, IServerConfig } from "../../lib/config/IServerConfig.js";

// For backward compatibility, also export the interface with required fields
import type { IServerConfig as IBaseServerConfig, Transport, HandlerSet } from "../../lib/config/IServerConfig.js";

/**
 * V2 Server configuration with required fields
 * @deprecated Use IServerConfig from lib/config/IServerConfig.js
 */
export interface IV2ServerConfig extends IBaseServerConfig {
  // Transport is required for v2
  transport: Transport;
  // Exposition is required for v2
  exposition: HandlerSet[];
}
