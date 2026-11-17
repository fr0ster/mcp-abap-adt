/**
 * The exact-optional typecheck of server-runtime's exported contracts whose
 * optional fields a caller fills from a possibly absent value (no-assertions
 * plan, S2c; spec §8): each such field takes `undefined` under
 * `exactOptionalPropertyTypes`. Run by `test:check`, under `exactOptionalPropertyTypes` as every
 * project is; never emitted (excluded from the
 * build).
 */

import type { HttpConfig } from '../../http/config/httpParameters';
import type { StreamableHttpServerOptions } from '../../http/StreamableHttpServer';
import type { SseConfig } from '../../sse/config/sseParameters';
import type { SseServerOptions } from '../../sse/SseServer';
import type { DestinationFailureOptions } from '../../stdio/auth/destinationFailure';
import type { CoreConfig } from '../../stdio/config/coreParameters';

export const core: CoreConfig = {
  configFile: undefined,
  systemType: undefined,
  envFile: undefined,
  envDestination: undefined,
  envPath: undefined,
  authBrokerPath: undefined,
  connectionType: undefined,
  language: undefined,
};

export const http: HttpConfig = {
  stateIdleMinutes: undefined,
  host: undefined,
  port: undefined,
  allowedHosts: undefined,
  enableDnsRebindingProtection: undefined,
  tls: undefined,
};

export const sse: SseConfig = {
  stateIdleMinutes: undefined,
  host: undefined,
  port: undefined,
  allowedOrigins: undefined,
  tls: undefined,
};

export const httpServer: StreamableHttpServerOptions = {
  stateIdleMinutes: undefined,
  app: undefined,
  tls: undefined,
  allowedHosts: undefined,
  allowedOrigins: undefined,
  enableDnsRebindingProtection: undefined,
};

export const sseServer: SseServerOptions = {
  stateIdleMinutes: undefined,
  app: undefined,
  tls: undefined,
  allowedHosts: undefined,
  allowedOrigins: undefined,
  enableDnsRebindingProtection: undefined,
  port: undefined,
};

export const destinationFailure: DestinationFailureOptions = {
  destination: undefined,
  platform: undefined,
  sentenceFor: undefined,
};
