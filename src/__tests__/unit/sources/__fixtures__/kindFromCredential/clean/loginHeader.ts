// Clean: a conditional on the credential type choosing a login header.
import type { SapConfig } from '@mcp-abap-adt/connection';

export function loginHeaders(config: SapConfig): Record<string, string> {
  return config.authType === 'basic'
    ? { 'x-sap-login': config.username ?? '' }
    : {};
}
