/**
 * The authentications this server supports — exactly these three: `basic`,
 * `snc` and `jwt` / `authorization_code`. Adding one means a handler here, the
 * docs' table and a test; nothing else. `jwt` / `none` (a token you hold) is
 * not one: it is refused like any authentication not here, and the
 * refusal says where it went — the `x-sap-jwt-token` header of
 * `mcp-abap-adt-http` / `mcp-abap-adt-sse`.
 */

import { UnsupportedAuthenticationError } from '../destinationFailure';
import type { VettedAuthentication } from '../vocabulary';
import { basicHandler } from './basic';
import { jwtAuthorizationCodeHandler } from './jwtAuthorizationCode';
import { sncHandler } from './snc';
import type { AuthenticationHandler } from './types.js';

export type { AuthenticationHandler, AuthHandlerContext } from './types.js';

export const HANDLERS: readonly AuthenticationHandler[] = [
  basicHandler,
  sncHandler,
  jwtAuthorizationCodeHandler,
];

const keyOf = (authType: string, grantType?: string) =>
  grantType ? `${authType}/${grantType}` : authType;

const byKey = new Map(
  HANDLERS.map((h) => [keyOf(h.authType, h.grantType), h] as const),
);

/** The handler for a vetted authentication; throws `UnsupportedAuthenticationError`. */
export function handlerFor(
  destination: string,
  vetted: VettedAuthentication,
): AuthenticationHandler {
  const found = byKey.get(keyOf(vetted.authType, vetted.grantType));
  if (!found) {
    throw new UnsupportedAuthenticationError(
      destination,
      vetted.authType,
      vetted.grantType,
    );
  }
  return found;
}
