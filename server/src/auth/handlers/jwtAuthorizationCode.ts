import { serverLogin } from '../serverLogin';
import type { AuthenticationHandler } from './types.js';

/**
 * A browser login (D8): each strategy the broker asks for is auth-providers'
 * composed callback strategy inside `serverLogin`. One destination per
 * process, so its provider serializes its own logins; no lock is needed.
 */
export const jwtAuthorizationCodeHandler: AuthenticationHandler = {
  authType: 'jwt',
  grantType: 'authorization_code',
  brokerOptions: (context) => ({
    authorization: () =>
      serverLogin(
        context.browserStrategy({
          ...(context.browser !== undefined && { browser: context.browser }),
          ...(context.browserAuthPort !== undefined && {
            port: context.browserAuthPort,
          }),
        }),
        context.login,
      ),
  }),
};
