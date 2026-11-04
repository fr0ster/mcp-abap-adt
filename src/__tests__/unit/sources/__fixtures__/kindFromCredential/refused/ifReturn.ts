// Refused (return, kind): a kind returned from a branch on the credential.
import type { SapConfig } from '@mcp-abap-adt/connection';

export function kindOf(config: SapConfig): 'cloud' | 'onprem' {
  if (config.authType === 'jwt') return 'cloud';
  return 'onprem';
}
