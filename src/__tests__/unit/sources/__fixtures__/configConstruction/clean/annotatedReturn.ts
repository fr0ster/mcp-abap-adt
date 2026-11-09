// Clean: the function declares its return type and builds a literal of it.
import type { ISapRfcConfig } from '@mcp-abap-adt/interfaces-auth-sap';

const build = (): ISapRfcConfig => ({
  connectionType: 'rfc',
  authType: 'basic',
  ashost: 'host',
  sysnr: '00',
  client: '100',
  language: 'EN',
});
export const config: ISapRfcConfig = build();
