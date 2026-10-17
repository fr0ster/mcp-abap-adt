import { AuthProviderFailure } from '@mcp-abap-adt/auth-errors';

const C = AuthProviderFailure;
export const isFailure = (x: unknown) => x instanceof C;
