import { SapConfig } from "../config/sapConfig.js";
import { AbapConnection } from "./AbapConnection.js";
import { CloudAbapConnection } from "./CloudAbapConnection.js";
import { OnPremAbapConnection } from "./OnPremAbapConnection.js";
import { ILogger, ISessionStorage } from "../logger.js";

export function createAbapConnection(
  config: SapConfig,
  logger: ILogger,
  sessionStorage?: ISessionStorage,
  sessionId?: string
): AbapConnection {
  switch (config.authType) {
    case "basic":
      return new OnPremAbapConnection(config, logger, sessionStorage, sessionId);
    case "jwt":
      return new CloudAbapConnection(config, logger, sessionStorage, sessionId);
    default:
      throw new Error(`Unsupported SAP authentication type: ${config.authType}`);
  }
}

