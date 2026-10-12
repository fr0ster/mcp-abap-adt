import { refreshThenLogin } from '@mcp-abap-adt/auth-providers';
import { browserFor } from '../browsers';
import { oneLoginAtATime } from '../loginLock';
import type { AuthenticationHandler } from './types.js';

/**
 * A token row: auth-broker 5 requires how it renews and what a session write
 * that did not land means. Both are what broker 4 did — refresh, then log in
 * when the refresh is refused; a failed write is logged and the call goes on.
 */
export const jwtAuthorizationCodeHandler: AuthenticationHandler = {
  authType: 'jwt',
  grantType: 'authorization_code',
  brokerOptions: (context) => {
    const browser = browserFor(context.browser);
    return {
      authorization: () =>
        oneLoginAtATime(
          context.browserStrategy({
            ...(browser && { browser }),
            ...(context.browserAuthPort !== undefined && {
              port: context.browserAuthPort,
            }),
          }),
          context.loginLock,
        ),
      renewal: () => refreshThenLogin(),
      onWriteFailure: 'continue',
    };
  },
};
