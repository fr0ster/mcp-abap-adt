// Types
export type {
  SapConfig,
  SapAuthType,
} from "./config/sapConfig.js";
export type { AbapRequestOptions } from "./connection/AbapConnection.js";

// Interfaces
export type { AbapConnection } from "./connection/AbapConnection.js";
export type { ILogger, SessionState, ISessionStorage } from "./logger.js";

// Connection classes
export { BaseAbapConnection } from "./connection/BaseAbapConnection.js";
export { OnPremAbapConnection } from "./connection/OnPremAbapConnection.js";
export { CloudAbapConnection } from "./connection/CloudAbapConnection.js";

// Factory
export { createAbapConnection } from "./connection/connectionFactory.js";

// Config utilities
export { sapConfigSignature } from "./config/sapConfig.js";

// Timeouts
export { getTimeout, getTimeoutConfig, type TimeoutConfig } from "./utils/timeouts.js";

