// Refused (return, credential-boolean): `Boolean(…)` of a token.
import type { SapConfig } from '@mcp-abap-adt/connection';

export function isCloudConnection(config: SapConfig): boolean {
  return Boolean(config.jwtToken);
}
