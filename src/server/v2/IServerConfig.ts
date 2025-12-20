/**
 * V2 Server configuration
 */

import { IServerConfig as IBaseServerConfig } from "../../lib/config/IServerConfig.js";

export type Transport = 'stdio' | 'sse' | 'http';
export type HandlerSet = 'readonly' | 'high' | 'low';

export interface IServerConfig extends IBaseServerConfig {
  // Transport settings (v2 specific)
  transport: Transport;
  host?: string;
  port?: number;
  httpJsonResponse?: boolean;

  // Environment settings (v2 alias)
  envFile?: string; // Alias for envFilePath

  // Handler exposition (v2 specific)
  exposition: HandlerSet[];

  // Config file (v2 specific)
  configFile?: string;
}
