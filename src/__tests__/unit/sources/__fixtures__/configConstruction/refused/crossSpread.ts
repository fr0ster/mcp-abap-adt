// Refused (cross-spread): the HTTP settings spread into an RFC literal.
import type { SapHttpConfig, SapRfcConfig } from '@mcp-abap-adt/connection';

export function rfcOf(http: SapHttpConfig): SapRfcConfig {
  return {
    ...http,
    url: undefined,
    connectionType: 'rfc',
    client: '100',
    language: 'EN',
    ashost: 'host.example.test',
    sysnr: '00',
  };
}
