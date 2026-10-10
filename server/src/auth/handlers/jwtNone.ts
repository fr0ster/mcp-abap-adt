import type { AuthenticationHandler } from './types.js';

export const jwtNoneHandler: AuthenticationHandler = {
  authType: 'jwt',
  grantType: 'none',
  brokerOptions: () => ({}),
};
