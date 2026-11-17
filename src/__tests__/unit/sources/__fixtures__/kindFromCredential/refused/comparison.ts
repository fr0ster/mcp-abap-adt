// Refused (comparison, kind): a kind computed from the credential type,
// compared with the declared one.
import type { SapConfig } from '@mcp-abap-adt/connection';

export function check(config: SapConfig, kind: 'cloud' | 'onprem'): void {
  if ((config.authType === 'jwt' ? 'cloud' : 'onprem') !== kind) {
    throw new TypeError('the credential disagrees with the declared kind');
  }
}
