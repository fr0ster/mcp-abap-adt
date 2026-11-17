// Clean: a switch on the credential type choosing how to authenticate.
import type { SapConfig } from '@mcp-abap-adt/connection';

export function providerName(config: SapConfig): string {
  switch (config.authType) {
    case 'jwt':
      return 'token';
    case 'basic':
      return 'password';
    default:
      return 'other';
  }
}
