// Refused (return, kind): a kind read from a non-secret authorization field.
import type { SapConfig } from '@mcp-abap-adt/connection';

export function kindOf(config: SapConfig): 'cloud' | 'onprem' {
  return config.uaaUrl ? 'cloud' : 'onprem';
}
