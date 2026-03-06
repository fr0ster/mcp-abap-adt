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
      // Use random port from high range (30000-39999) to avoid conflicts
      // with other services and parallel MCP instances
      this.browserAuthPort = 30000 + Math.floor(Math.random() * 10000);
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
