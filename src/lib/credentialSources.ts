/**
 * Two of the three places a credential comes from. (The third is a
 * destination: the broker's `getProvider`.)
 *
 * Each is its own function, none inside the connector construction: the
 * factory is handed a credential and builds nothing from `settings`.
 */

import {
  BasicAuthProvider,
  CertificateAuthProvider,
  FileCertificateMaterialLoader,
  SamlAuthProvider,
  TokenAuthProvider,
} from '@mcp-abap-adt/auth-providers';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';

/** Kerberos has no credential provider — see the upstream issue. */
function refuseKerberos(): never {
  throw new Error(
    'Kerberos authentication is not available: @mcp-abap-adt/connection 6.0 removed ' +
      'KerberosAbapConnection without a replacement (it was single-leg and untested ' +
      'against a live KDC — fr0ster/mcp-abap-adt-connection#35). Use basic, jwt, saml ' +
      'or certificate authentication.',
  );
}

/**
 * The credential a caller's `SapConfig` describes: `basic`, `jwt`, `saml`,
 * `certificate`; `kerberos` is refused.
 */
export function credentialFromSapConfig(config: SapConfig): IAuthProvider {
  switch (config.authType) {
    case 'basic':
      return new BasicAuthProvider(
        config.username ?? '',
        config.password ?? '',
      );
    case 'jwt':
      // A token against an on-premise system is ordinary; the system kind is
      // stated separately.
      return TokenAuthProvider.fixed(config.jwtToken ?? '');
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
 * The settings and the credential a direct request carries in its headers:
 * `x-sap-jwt-token`, or `x-sap-login` with `x-sap-password`. The settings hold
 * no secret; the credential holds it.
 */
export function credentialFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): { settings: SapConfig; credential: IAuthProvider } {
  const getHeader = (name: string): string | undefined => {
    const value = headers[name] ?? headers[name.toUpperCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  const url = getHeader('x-sap-url');
  const jwtToken = getHeader('x-sap-jwt-token');
  const username = getHeader('x-sap-login');
  const password = getHeader('x-sap-password');
  const client = getHeader('x-sap-client') || '';

  if (!url) {
    throw new Error('x-sap-url header is required for direct SAP connection');
  }
  if (jwtToken) {
    return {
      settings: { url, client, authType: 'jwt' },
      credential: TokenAuthProvider.fixed(jwtToken),
    };
  }
  if (username && password) {
    return {
      settings: { url, client, authType: 'basic' },
      credential: new BasicAuthProvider(username, password),
    };
  }
  throw new Error(
    'Either x-sap-jwt-token or x-sap-login+x-sap-password headers are required',
  );
}
