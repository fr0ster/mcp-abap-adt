import { oneLoginAtATime } from '../loginLock';
import type { AuthenticationHandler } from './types.js';

export const jwtAuthorizationCodeHandler: AuthenticationHandler = {
  authType: 'jwt',
  grantType: 'authorization_code',
  brokerOptions: (context) => ({
    authorization: () =>
      oneLoginAtATime(
        context.browserStrategy({
          browser: context.browser,
          ...(context.browserAuthPort !== undefined && {
            port: context.browserAuthPort,
          }),
        }),
        context.loginLock,
      ),
  }),
};
