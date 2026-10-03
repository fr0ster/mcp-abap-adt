/**
 * The vocabulary of authentication broker 4 accepts, held in code.
 *
 * A key store answers `authType` and `grantType` as the strings its file
 * holds, unchecked. `vetMeans` checks them before anything is built; an
 * unknown string is refused without being quoted (H4).
 */

import { DestinationConfigError } from '@mcp-abap-adt/auth-broker';
import type {
  DestinationGrant,
  IConnectionConfig,
} from '@mcp-abap-adt/interfaces-auth-broker';

export const AUTH_TYPES = ['basic', 'jwt', 'saml', 'snc'] as const;
export type AuthType = (typeof AUTH_TYPES)[number];

/**
 * Every `DestinationGrant`. `satisfies` stops a name the contract lacks; the
 * exhaustiveness check against the type (a member the contract adds) is the
 * test file's, so a contract change breaks `test:check`.
 */
export const GRANTS = [
  'authorization_code',
  'client_credentials',
  'passcode',
  'oidc_authorization_code',
  'device_code',
  'password',
  'token_exchange',
  'saml2_pure',
  'saml2_bearer',
  'none',
] as const satisfies readonly DestinationGrant[];

const AUTH_TYPE_REASON =
  'authType is missing or not one of: basic, jwt, saml, snc.';
const GRANT_REASON = 'grantType is missing or not a known grant.';

function isAuthType(value: unknown): value is AuthType {
  return (
    typeof value === 'string' &&
    (AUTH_TYPES as readonly string[]).includes(value)
  );
}

function isGrant(value: unknown): value is DestinationGrant {
  return (
    typeof value === 'string' && (GRANTS as readonly string[]).includes(value)
  );
}

export interface VettedAuthentication {
  authType: AuthType;
  grantType?: DestinationGrant;
}

/** Checks what a destination states against the vocabulary; throws `DestinationConfigError`. */
export function vetMeans(
  destination: string,
  means: IConnectionConfig | null,
): VettedAuthentication {
  const authType: unknown = means?.authType;
  if (!isAuthType(authType)) {
    throw new DestinationConfigError(
      destination,
      ['authType'],
      AUTH_TYPE_REASON,
    );
  }
  // The broker reads a grant for `jwt` and `saml` only.
  if (authType === 'basic' || authType === 'snc') return { authType };
  const grantType: unknown = means?.grantType;
  if (!isGrant(grantType)) {
    throw new DestinationConfigError(destination, ['grantType'], GRANT_REASON);
  }
  return { authType, grantType };
}
