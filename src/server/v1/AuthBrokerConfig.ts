/**
 * V1 Server configuration adapter for AuthBrokerFactory
 * Maps v1 ServerConfig to IAuthBrokerFactoryConfig
 */

import type { IAuthBrokerFactoryConfig } from "../../lib/auth/IAuthBrokerFactoryConfig.js";

export class AuthBrokerConfig implements IAuthBrokerFactoryConfig {
  defaultMcpDestination?: string;
  defaultDestination?: string;
  envFilePath?: string;
  authBrokerPath?: string;
  unsafe: boolean;
  transportType: string;
  useAuthBroker?: boolean;
  browserAuthPort?: number;
  logger?: any;

  constructor(
    defaultMcpDestination: string | undefined,
    defaultDestination: string | undefined,
    envFilePath: string | undefined,
    authBrokerPath: string | undefined,
    unsafe: boolean,
    transportType: string,
    useAuthBroker: boolean | undefined,
    logger: any
  ) {
    this.defaultMcpDestination = defaultMcpDestination;
    this.defaultDestination = defaultDestination;
    this.envFilePath = envFilePath;
    this.authBrokerPath = authBrokerPath;
    this.unsafe = unsafe;
    this.transportType = transportType;
    this.useAuthBroker = useAuthBroker;
    // V1 uses SSE on port 3001, set browser auth to 4000 to avoid conflict
    this.browserAuthPort = 4000;
    this.logger = logger;
  }
}
