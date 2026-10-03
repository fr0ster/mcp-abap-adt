/**
 * Authentication module exports
 */

export { AuthBrokerFactory } from './brokerFactory';
export { assertDestinationName } from './destinationName';
export { describeAuthError, UnsupportedAuthenticationError } from './errors';
export type {
  IAuthBrokerFactory,
  IDestinations,
  SettleReport,
} from './IAuthBrokerFactory.js';
export type { IAuthBrokerFactoryConfig } from './IAuthBrokerFactoryConfig.js';
