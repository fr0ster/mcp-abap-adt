/**
 * Authentication module exports
 */

export { DestinationConfigError } from '@mcp-abap-adt/auth-broker';
export { AuthBrokerFactory } from './brokerFactory';
export { assertDestinationName } from './destinationName';
export { describeAuthError, UnsupportedAuthenticationError } from './errors';
export type {
  IAuthBrokerFactory,
  IDestinations,
  SettleReport,
} from './IAuthBrokerFactory.js';
export type { IAuthBrokerFactoryConfig } from './IAuthBrokerFactoryConfig.js';
