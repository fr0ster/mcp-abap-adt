// Refused (return, credential-boolean): membership of the credential type.
import type { SapConfig } from '@mcp-abap-adt/connection';

export function isCloudConnection(config: SapConfig): boolean {
  return ['jwt', 'saml'].includes(config.authType);
}
