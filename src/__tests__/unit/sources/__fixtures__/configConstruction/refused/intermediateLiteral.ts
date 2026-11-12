// Refused (forbidden-property): an inferred intermediate literal carrying
// `url: undefined`, used as an RFC config.
import type { ISapRfcConfig } from '@mcp-abap-adt/interfaces-auth-sap';

const value = {
  connectionType: 'rfc' as const,
  authType: 'basic' as const,
  ashost: 'host',
  sysnr: '00',
  client: '100',
  language: 'EN',
  url: undefined,
};
export const config: ISapRfcConfig = value;
