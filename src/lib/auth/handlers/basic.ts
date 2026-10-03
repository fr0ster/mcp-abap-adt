import type { AuthenticationHandler } from './types.js';

export const basicHandler: AuthenticationHandler = {
  authType: 'basic',
  brokerOptions: () => ({}),
};
