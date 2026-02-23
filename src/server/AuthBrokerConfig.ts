/**
 * V2 Server configuration adapter for AuthBrokerFactory
 * Maps v2 ServerConfig to IAuthBrokerFactoryConfig
 */

import type { ILogger } from '@mcp-abap-adt/interfaces';
import type { IAuthBrokerFactoryConfig } from '../lib/auth/IAuthBrokerFactoryConfig.js';
import type { IServerConfig } from './IServerConfig.js';

export class AuthBrokerConfig implements IAuthBrokerFactoryConfig {
  defaultMcpDestination?: string;
  defaultDestination?: string;
  envFilePath?: string;
  authBrokerPath?: string;
  unsafe: boolean;
  transportType: string;
  useAuthBroker?: boolean;
  browserAuthPort?: number;
  browser?: string;
  logger?: ILogger;

  constructor(serverConfig: IServerConfig, logger?: ILogger) {
    this.defaultMcpDestination = serverConfig.mcpDestination;
    this.defaultDestination = serverConfig.mcpDestination;
    this.envFilePath = serverConfig.envFile || serverConfig.envFilePath;
    this.authBrokerPath = serverConfig.authBrokerPath;
    this.unsafe = serverConfig.unsafe ?? false;
    this.transportType = serverConfig.transport || 'stdio';
    this.useAuthBroker = serverConfig.useAuthBroker;
    this.browser = serverConfig.browser;

    if (serverConfig.browserAuthPort) {
      this.browserAuthPort = serverConfig.browserAuthPort;
    } else {
      // Set browser auth port to avoid conflicts with server ports
      // stdio: 4001 (no server port), sse: 4000 (SSE server uses 3001), http: 5000 (HTTP server uses 3000)
      if (serverConfig.transport === 'sse') {
        this.browserAuthPort = 4000;
      } else if (serverConfig.transport === 'http') {
        this.browserAuthPort = 5000;
      } else {
        this.browserAuthPort = 4001; // stdio: use 4001 to avoid conflict with HTTP (3000) and SSE (3001)
      }
    }

    this.logger = logger;
  }

  static fromServerConfig(
    config: IServerConfig,
    logger?: ILogger,
  ): AuthBrokerConfig {
    return new AuthBrokerConfig(config, logger);
  }
}
