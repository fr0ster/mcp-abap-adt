/**
 * Authentication module exports
 */

export { DestinationConfigError } from '@mcp-abap-adt/auth-broker';
/** The browser strategy the program passes to the factory (Ruling 1). */
export { browserCallbackStrategy } from '@mcp-abap-adt/auth-providers';
/** Where service keys and sessions live by default. */
export { getPlatformPaths } from '../stores/platformPaths';
export { assertDestinationName } from './destinationName';
export {
  DestinationRefusal,
  describeAuthError,
  errorClassOf,
  SettingsError,
  UnsupportedAuthenticationError,
} from './errors';
export type {
  DestinationSystemContext,
  IAuthBrokerFactory,
  IDestinations,
  SettleReport,
} from './IAuthBrokerFactory.js';
export {
  type AuthType,
  type VettedAuthentication,
  vetMeans,
} from './vocabulary';
