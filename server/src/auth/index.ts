/**
 * `@mcp-abap-adt/core/auth` — the destination layer: one auth broker per
 * destination, built from its service key and session stores; the browser
 * of a login and the server's login wrapper.
 */

export { destinationSource } from '../destinationSource';
export { AuthBrokerFactory } from './brokerFactory';
export {
  BROWSER_NAMES,
  type BrowserChoice,
  BrowserChoiceError,
  type BrowserMapping,
  type BrowserName,
  browserFor,
  browserOf,
} from './browser';
export {
  type DestinationFailureOptions,
  DestinationRefusal,
  destinationFailureOf,
  destinationFailureWords,
  HINTS,
  UnsupportedAuthenticationError,
} from './destinationFailure';
export type {
  IAuthBrokerFactory,
  IDestinations,
  SettleReport,
} from './IAuthBrokerFactory.js';
export type {
  IAuthBrokerFactoryConfig,
  LoginStrategyOptions,
} from './IAuthBrokerFactoryConfig.js';
export {
  promptLogger,
  type ServerLoginContext,
  serverLogin,
} from './serverLogin';
export {
  REFRESH_ONLY_SENTENCE,
  RENEWAL_MODES,
  type RenewalMode,
  type ServerState,
  SHUTDOWN_SENTENCE,
  serverSentence,
} from './serverSentences';
export {
  AUTH_TYPES,
  type AuthType,
  GRANTS,
  type VettedAuthentication,
  vetMeans,
} from './vocabulary';
