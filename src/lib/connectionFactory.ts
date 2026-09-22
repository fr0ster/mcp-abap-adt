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

/**
 * Whether the RFC wire should log what it carries, and how much of it.
 *
 * **Off unless asked for, and asked for by environment rather than by
 * argument.** The question this answers is diagnostic — "did the body we built
 * reach `SADT_REST_RFC_ENDPOINT` intact?" — and it is asked by whoever is
 * sitting in front of a misbehaving on-premise system, not by a caller writing
 * code. An argument would have to be threaded through every call site for a
 * switch nobody sets in production; an environment variable is read where the
 * transport is built and nowhere else. `DEBUG_CONNECTORS` already works this
 * way.
 *
 * `@mcp-abap-adt/connection` 8.1.0 is what made this possible, and it is also
 * why the output is safe to paste into an issue: it replaces the values of
 * `Authorization`, any `Cookie`, and anything matching `token`, `secret`,
 * `password`, `credential` or an API key with `[redacted]` — keeping the
 * names — and clips a body at `maxLoggedBodyChars`. Bodies themselves are not
 * redacted, so a body carrying a credential would still be logged: this is for
 * a payload under suspicion, not for routine logging.
 *
 * `DEBUG_RFC_BODY_CHARS` takes `0` for the size alone and `Infinity` for the
 * whole body; anything unparseable is left to the package, which falls back to
 * its own default rather than failing a connection over a debug option.
 */
/**
 * The logger the RFC wire writes to, which the switch has to provide itself.
 *
 * **Asking for the wire and getting nothing is the failure this exists to
 * prevent.** `RfcTransport` writes only when it has both `logWire` and a
 * logger, and the server's own path builds its connection with no logger at
 * all — `BaseMcpServer` passes `undefined`. So `DEBUG_RFC_WIRE=true` set the
 * option, the transport checked for a logger, found none, and the documented
 * switch did nothing on the one path that matters most.
 *
 * A caller's logger always wins: it is theirs, it may go somewhere specific,
 * and this must not redirect it. Only when there is none does asking for the
 * wire bring one, at `debug`, because a wire log below `debug` is a wire log
 * nobody sees.
 *
 * **It writes to stderr, and that is not a preference.** In stdio transport —
 * how this server is usually run — stdout carries JSON-RPC and nothing else.
 * `DefaultLogger` puts `debug` and `info` on stdout, so supplying one here
 * would interleave `RFC HEADERS: …` with the protocol and break the session
 * with the client: a debug switch that takes the server down is worse than
 * one that prints nothing, which is what this started as.
 *
 * stderr is where a server's diagnostics belong for exactly this reason, and
 * it is where `DefaultLogger` already puts `warn` and `error` — so this is
 * that logger's own convention applied to the two levels it does not.
 */
function wireLogger(logger: ILogger | null | undefined): ILogger | undefined {
  if (logger) return logger;
  if (!rfcWireOptions().logWire) return undefined;

  const write =
    (level: string) =>
    (message: string, meta?: unknown): void => {
      process.stderr.write(`[${level}] ${message}\n`);
      if (meta !== undefined) process.stderr.write(`${JSON.stringify(meta)}\n`);
    };

  return {
    debug: write('DEBUG'),
    info: write('INFO'),
    warn: write('WARN'),
    error: write('ERROR'),
  };
}

function rfcWireOptions(): { logWire: boolean; maxLoggedBodyChars?: number } {
  const asked =
    process.env.DEBUG_RFC_WIRE === 'true' || process.env.DEBUG_RFC_WIRE === '1';
  const ceiling = process.env.DEBUG_RFC_BODY_CHARS;
  return {
    logWire: asked,
    ...(ceiling === undefined || ceiling === ''
      ? {}
      : {
          maxLoggedBodyChars:
            ceiling === 'Infinity' ? Number.POSITIVE_INFINITY : Number(ceiling),
        }),
  };
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
      new RfcTransport(
        rfcConversationFrom(config),
        wireLogger(logger),
        rfcWireOptions(),
      ),
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
