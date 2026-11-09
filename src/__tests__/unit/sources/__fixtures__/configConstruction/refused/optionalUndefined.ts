// Refused (forbidden-key): `url?: undefined` declared — optional, but carried.
import type { ISapRfcConfig } from '@mcp-abap-adt/interfaces-auth-sap';

const bad: {
  connectionType: 'rfc';
  authType: 'basic';
  ashost: string;
  sysnr: string;
  client: string;
  language: string;
  url: undefined;
} = {
  connectionType: 'rfc',
  authType: 'basic',
  ashost: 'host',
  sysnr: '00',
  client: '100',
  language: 'EN',
  url: undefined,
};
const optional: {
  connectionType: 'rfc';
  authType: 'basic';
  ashost: string;
  sysnr: string;
  client: string;
  language: string;
  url?: undefined;
} = bad;
export const config: ISapRfcConfig = optional;
