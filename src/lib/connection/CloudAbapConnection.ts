import { SapConfig } from "../sapConfig";
import { BaseAbapConnection } from "./BaseAbapConnection";

export class CloudAbapConnection extends BaseAbapConnection {
  constructor(config: SapConfig) {
    CloudAbapConnection.validateConfig(config);
    super(config);
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
