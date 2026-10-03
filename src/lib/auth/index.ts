/**
 * Authentication module exports
 */

export { DestinationConfigError } from '@mcp-abap-adt/auth-broker';
/** The browser strategy the program passes to the factory (Ruling 1). */
export { browserCallbackStrategy } from '@mcp-abap-adt/auth-providers';
export { AuthBrokerFactory } from './brokerFactory';
export { assertDestinationName } from './destinationName';
export {
  DestinationRefusal,
  describeAuthError,
  errorClassOf,
  UnsupportedAuthenticationError,
} from './errors';
export type {
  DestinationSystemContext,
  IAuthBrokerFactory,
  IDestinations,
  SettleReport,
} from './IAuthBrokerFactory.js';
export type { IAuthBrokerFactoryConfig } from './IAuthBrokerFactoryConfig.js';
