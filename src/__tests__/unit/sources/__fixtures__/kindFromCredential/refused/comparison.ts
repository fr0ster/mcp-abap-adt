// Refused (comparison, kind): a kind computed from the credential type,
// compared with the declared one.
import type { SapConfig } from '@mcp-abap-adt/connection';

export function agrees(config: SapConfig, kind: 'cloud' | 'onprem'): boolean {
  return (config.authType === 'jwt' ? 'cloud' : 'onprem') === kind;
}
