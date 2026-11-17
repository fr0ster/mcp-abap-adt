// Refused (return, credential-boolean): the removed `isCloudConnection`.
import type { SapConfig } from '@mcp-abap-adt/connection';

export function isCloudConnection(config: SapConfig): boolean {
  return config.authType === 'jwt';
}
