import { SapConfig } from "../sapConfig";
import { BaseAbapConnection } from "./BaseAbapConnection";

export class OnPremAbapConnection extends BaseAbapConnection {
  constructor(config: SapConfig) {
    OnPremAbapConnection.validateConfig(config);
    super(config);
  }

  protected buildAuthorizationHeader(): string {
    const { username, password } = this.getConfig();
    const safeUsername = username ?? "";
    const safePassword = password ?? "";
    const token = Buffer.from(`${safeUsername}:${safePassword}`).toString("base64");
    return `Basic ${token}`;
  }

  private static validateConfig(config: SapConfig): void {
    if (config.authType !== "basic") {
      throw new Error(`On-premise connection expects authType "basic", got "${config.authType}"`);
    }

    if (!config.username || !config.password) {
      throw new Error("Basic authentication requires both username and password");
    }

    if (!config.client) {
      throw new Error("Basic authentication requires SAP_CLIENT to be provided");
    }
  }
}
