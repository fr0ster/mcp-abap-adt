import { SapConfig } from "../sapConfig";
import { AbapConnection } from "./AbapConnection";
import { CloudAbapConnection } from "./CloudAbapConnection";
import { OnPremAbapConnection } from "./OnPremAbapConnection";

export function createAbapConnection(config: SapConfig): AbapConnection {
  switch (config.authType) {
    case "basic":
      return new OnPremAbapConnection(config);
    case "jwt":
      return new CloudAbapConnection(config);
    default:
      throw new Error(`Unsupported SAP authentication type: ${config.authType}`);
  }
}
