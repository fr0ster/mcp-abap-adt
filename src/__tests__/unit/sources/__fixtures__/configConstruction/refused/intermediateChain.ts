// Refused (forbidden-property): the intermediate literal reached through a
// second variable, used as an RFC config.
import type { ISapRfcConfig } from '@mcp-abap-adt/interfaces-auth-sap';

const inner = {
  connectionType: 'rfc' as const,
  authType: 'basic' as const,
  ashost: 'host',
  sysnr: '00',
  client: '100',
  language: 'EN',
  url: undefined,
};
const value = inner;
export const config: ISapRfcConfig = value;
