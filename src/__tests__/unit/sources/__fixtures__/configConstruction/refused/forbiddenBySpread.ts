// Refused (forbidden-property): `url: undefined` carried into an RFC literal by a spread.
import type { SapRfcConfig } from '@mcp-abap-adt/connection';

const logon = {
  authType: 'basic' as const,
  connectionType: 'rfc' as const,
  client: '100',
  language: 'EN',
  url: undefined,
};

export const config: SapRfcConfig = {
  ...logon,
  ashost: 'host.example.test',
  sysnr: '00',
};
