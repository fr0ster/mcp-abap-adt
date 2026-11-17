// Known limit: a destructuring default is not one of the places checked.
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
const { config = bad }: { config?: ISapRfcConfig } = {};
export const used: ISapRfcConfig = config;
