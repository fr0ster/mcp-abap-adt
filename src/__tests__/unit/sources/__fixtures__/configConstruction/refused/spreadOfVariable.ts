// Refused (forbidden-key): a variable carrying `url` spread into the config.
import type { ISapRfcConfig } from '@mcp-abap-adt/interfaces-auth-sap';

const bad = {
  connectionType: 'rfc' as const,
  authType: 'basic' as const,
  ashost: 'host',
  sysnr: '00',
  client: '100',
  language: 'EN',
  url: undefined,
};
export const config: ISapRfcConfig = { ...bad, client: '200' };
