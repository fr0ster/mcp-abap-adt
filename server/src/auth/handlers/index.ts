/**
 * The authentications this server supports — exactly these four. Adding one
 * means a handler here, the docs' table and a test; nothing else.
 */

import {
  UnsupportedAuthenticationError,
  type VettedAuthentication,
} from '@mcp-abap-adt/lib/auth';
import { basicHandler } from './basic';
import { jwtAuthorizationCodeHandler } from './jwtAuthorizationCode';
import { jwtNoneHandler } from './jwtNone';
import { sncHandler } from './snc';
import type { AuthenticationHandler } from './types.js';

export type { AuthenticationHandler, AuthHandlerContext } from './types.js';

export const HANDLERS: readonly AuthenticationHandler[] = [
  basicHandler,
  sncHandler,
  jwtAuthorizationCodeHandler,
  jwtNoneHandler,
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
