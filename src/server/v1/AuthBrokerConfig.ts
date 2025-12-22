/**
 * V1 Server configuration adapter for AuthBrokerFactory
 * Maps v1 ServerConfig to IAuthBrokerFactoryConfig
 */

import type { IAuthBrokerFactoryConfig } from '../../lib/auth/IAuthBrokerFactoryConfig.js';

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
  logger?: any;

  constructor(
    defaultMcpDestination: string | undefined,
    defaultDestination: string | undefined,
    envFilePath: string | undefined,
    authBrokerPath: string | undefined,
    unsafe: boolean,
    transportType: string,
    useAuthBroker: boolean | undefined,
    browser: string | undefined,
    logger: any,
  ) {
    this.defaultMcpDestination = defaultMcpDestination;
    this.defaultDestination = defaultDestination;
    this.envFilePath = envFilePath;
    this.authBrokerPath = authBrokerPath;
    this.unsafe = unsafe;
    this.transportType = transportType;
    this.useAuthBroker = useAuthBroker;
    this.browser = browser;
    // Set browser auth port to avoid conflicts with server ports
    // stdio: 4001 (no server port), sse: 4000 (SSE server uses 3001), http: 5000 (HTTP server uses 3000)
    if (transportType === 'sse') {
      this.browserAuthPort = 4000;
    } else if (
      transportType === 'http' ||
      transportType === 'streamable-http'
    ) {
      this.browserAuthPort = 5000;
    } else {
      this.browserAuthPort = 4001; // stdio: use 4001 to avoid conflict with HTTP (3000) and SSE (3001)
    }
    this.logger = logger;
  }
}
