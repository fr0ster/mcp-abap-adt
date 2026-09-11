/**
 * Builds an ABAP connection from a `SapConfig`.
 *
 * `@mcp-abap-adt/connection` 6.0 removed its factory on purpose: which system a
 * deployment dials, which credential it presents and which wire it uses are
 * three independent facts, and the old factory guessed the first from the third
 * — a bearer token against an on-premise system is ordinary, and inferring
 * "cloud" from it was wrong. The library now requires the caller to state all
 * three.
 *
 * We are that caller, and this is the one place in the server that decides.
 * Everything else keeps calling `createAbapConnection(config, logger, sessionId,
 * refresher)` exactly as before.
 *
 * See the library's `docs/MIGRATION-6.0.md`.
 */

import {
  AdtCloudConnector,
  AdtOnPremConnector,
  BasicAuthProvider,
  CertificateAuthProvider,
  CloudHttpTransport,
  FileCertificateMaterialLoader,
  type ILogger,
  OnPremHttpTransport,
  RfcTransport,
  rfcConversationFrom,
  SamlAuthProvider,
  type SapConfig,
  TokenAuthProvider,
} from '@mcp-abap-adt/connection';
import type {
  IAbapConnection,
  ITokenRefresher,
} from '@mcp-abap-adt/interfaces';

export type AbapSystemKind = 'onprem' | 'cloud';

/**
 * Which system this config dials.
 *
 * `SAP_SYSTEM_TYPE` states it outright and wins — `legacy` is an on-premise
 * system, just an older one. Absent that, a JWT means cloud, which is what the
 * removed factory did and what every existing deployment is therefore running
 * on; changing that default silently would re-route live connections.
 *
 * The point of reading the variable first is that the guess now has an
 * override: a bearer token against an on-premise system finally has a way to
 * say so.
 */
export function resolveSystemKind(
  config: SapConfig,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): AbapSystemKind {
  const declared = env.SAP_SYSTEM_TYPE?.trim().toLowerCase();
  if (declared === 'cloud') return 'cloud';
  if (declared === 'onprem' || declared === 'legacy') return 'onprem';
  return config.authType === 'jwt' ? 'cloud' : 'onprem';
}

/** Kerberos has no credential provider in connection 6.x — see the upstream issue. */
function refuseKerberos(): never {
  throw new Error(
    'Kerberos authentication is not available: @mcp-abap-adt/connection 6.0 removed ' +
      'KerberosAbapConnection without a replacement (it was single-leg and untested ' +
      'against a live KDC — fr0ster/mcp-abap-adt-connection#35). Use basic, jwt, saml ' +
      'or certificate authentication.',
  );
}

function onPremCredential(config: SapConfig) {
  switch (config.authType) {
    case 'basic':
      return new BasicAuthProvider(
        config.username ?? '',
        config.password ?? '',
      );
    case 'jwt':
      // Legitimate: a token against an on-premise system is ordinary, and the
      // system kind is stated separately.
      return new TokenAuthProvider(config.jwtToken ?? '');
    case 'saml':
      return new SamlAuthProvider(config.sessionCookies ?? '');
    case 'certificate':
      return new CertificateAuthProvider(
        new FileCertificateMaterialLoader(),
        config,
      );
    case 'kerberos':
      return refuseKerberos();
    default:
      return new BasicAuthProvider(
        config.username ?? '',
        config.password ?? '',
      );
  }
}

export function createAbapConnection(
  config: SapConfig,
  logger?: ILogger | null,
  sessionId?: string,
  tokenRefresher?: ITokenRefresher,
): IAbapConnection {
  const transportOptions = { client: config.client, baseUrl: config.url };

  if (resolveSystemKind(config) === 'cloud') {
    // The refresher is the credential now, not a constructor slot beside it. A
    // bare token still works and is honest about having no renewal behind it.
    const credential = new TokenAuthProvider(
      tokenRefresher ?? config.jwtToken ?? '',
    );
    return new AdtCloudConnector(
      config,
      credential,
      new CloudHttpTransport(() => ({}), logger, transportOptions),
      logger,
      sessionId,
    ) as unknown as IAbapConnection;
  }

  const credential = onPremCredential(config);

  if (config.connectionType === 'rfc') {
    return new AdtOnPremConnector(
      config,
      credential,
      new RfcTransport(rfcConversationFrom(config), logger),
      logger,
      sessionId,
    ) as unknown as IAbapConnection;
  }

  // A thunk, not a value: certificate material is loaded during connect(), so a
  // wire that read it at construction would read nothing and mTLS would
  // silently not happen.
  const agentOptions = () => credential.transportMaterial?.() ?? {};

  return new AdtOnPremConnector(
    config,
    credential,
    new OnPremHttpTransport(agentOptions, logger, transportOptions),
    logger,
    sessionId,
  ) as unknown as IAbapConnection;
}
