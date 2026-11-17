// Refused (forbidden-property): `url: undefined` on an RFC literal (omission, not undefined).
import type { SapRfcConfig } from '@mcp-abap-adt/connection';

export const config: SapRfcConfig = {
  authType: 'basic',
  connectionType: 'rfc',
  client: '100',
  language: 'EN',
  ashost: 'host.example.test',
  sysnr: '00',
  url: undefined,
};
