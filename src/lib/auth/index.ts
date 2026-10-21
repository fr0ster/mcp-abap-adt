/**
 * Authentication module exports
 */

import '../instance.js';

/** The browser strategy the program passes to the factory (Ruling 1). */
export { browserCallbackStrategy } from '@mcp-abap-adt/auth-providers';
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
  authenticationFailed,
  type FailureCode,
  failureOf,
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
  LEFTOVER_SESSION_NOT_AVAILABLE_WORDS,
  LEFTOVER_SESSIONS_UNAVAILABLE_WORDS,
  ServerRefusal,
  type ServerRefusalCode,
  serverRefusalOf,
} from './serverRefusal';
