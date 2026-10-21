import * as conn from '@mcp-abap-adt/connection';

export const isRefused = (x: unknown) => x instanceof conn.AuthRefusedError;
