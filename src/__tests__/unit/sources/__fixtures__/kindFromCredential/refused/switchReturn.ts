// Refused (return, kind): a kind chosen by a switch on the credential.
import type { SapConfig } from '@mcp-abap-adt/connection';

export function kindOf(config: SapConfig): 'cloud' | 'onprem' {
  switch (config.authType) {
    case 'jwt':
      return 'cloud';
    default:
      return 'onprem';
  }
}
