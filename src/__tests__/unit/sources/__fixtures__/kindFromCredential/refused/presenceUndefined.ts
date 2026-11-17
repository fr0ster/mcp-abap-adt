// Refused (return, credential-boolean): a presence test of a token.
import type { SapConfig } from '@mcp-abap-adt/connection';

export function isCloudConnection(config: SapConfig): boolean {
  return config.jwtToken !== undefined;
}
