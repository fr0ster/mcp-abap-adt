// Known limit: a getter's return under a config-typed property has no config target.
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
export const holder: { readonly config: ISapRfcConfig } = {
  get config() {
    return bad;
  },
};
