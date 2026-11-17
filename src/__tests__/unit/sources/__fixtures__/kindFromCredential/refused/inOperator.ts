// Refused (return, credential-boolean): the credential type looked up with `in`.
import type { SapConfig } from '@mcp-abap-adt/connection';

const CLOUD_AUTH = { jwt: true, saml: true };

export function isCloudConnection(config: SapConfig): boolean {
  return config.authType in CLOUD_AUTH;
}
