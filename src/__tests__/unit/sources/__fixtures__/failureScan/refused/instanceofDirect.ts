import { AuthRefusedError } from '@mcp-abap-adt/connection';

export const isRefused = (x: unknown) => x instanceof AuthRefusedError;
