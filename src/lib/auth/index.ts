/**
 * Authentication module exports
 */

/** The browser strategy the program passes to the factory (Ruling 1). */
export { browserCallbackStrategy } from '@mcp-abap-adt/auth-providers';
/** Where service keys and sessions live by default. */
export { getPlatformPaths } from '../stores/platformPaths';
export {
  answerFailure,
  answerRead,
  type FailureAnswer,
  failureLogFields,
  failureLogLine,
  failurePayload,
} from './answerFailure';
export { assertDestinationName } from './destinationName';
export type { DestinationSystemContext } from './destinationSystemContext';
export { errorClassOf, SettingsError } from './errors';
export {
  ADT_REQUEST_ABORTED,
  authenticationFailed,
  type FailureCode,
  failureOf,
  REQUEST_ABORTED_WORDS,
  type ReadFailure,
  readerFailed,
  readGuarded,
  readOwn,
} from './failures';
export {
  CREDENTIALS_REQUIRED_WORDS,
  DESTINATIONS_ONLY_STDIO_WORDS,
  FRESH_CONNECTION_UNAVAILABLE_WORDS,
  INSPECTION_ONLY_WORDS,
  ServerRefusal,
  type ServerRefusalCode,
  serverRefusalOf,
} from './serverRefusal';
