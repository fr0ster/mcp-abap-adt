import { SapConfig } from "../config/sapConfig.js";
import { BaseAbapConnection } from "./BaseAbapConnection.js";
import { ILogger, ISessionStorage } from "../logger.js";

export class CloudAbapConnection extends BaseAbapConnection {
  constructor(
    config: SapConfig,
    logger: ILogger,
    sessionStorage?: ISessionStorage,
    sessionId?: string
  ) {
    CloudAbapConnection.validateConfig(config);
    super(config, logger, sessionStorage, sessionId);
  }

  protected buildAuthorizationHeader(): string {
    const { jwtToken } = this.getConfig();
    return `Bearer ${jwtToken}`;
  }

  private static validateConfig(config: SapConfig): void {
    if (config.authType !== "jwt") {
      throw new Error(`Cloud connection expects authType "jwt", got "${config.authType}"`);
    }

    if (!config.jwtToken) {
      throw new Error("JWT authentication requires SAP_JWT_TOKEN to be provided");
    }
  }
}

