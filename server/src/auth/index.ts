/**
 * `@mcp-abap-adt/core/auth` — the destination layer: one auth broker per
 * destination, built from its service key and session stores.
 */

export { AuthBrokerFactory } from './brokerFactory';
export type { IAuthBrokerFactoryConfig } from './IAuthBrokerFactoryConfig.js';
