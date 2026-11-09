// Known limit: a config-constrained generic hides the caller's type.
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
function convert<T extends ISapRfcConfig>(value: T): ISapRfcConfig {
  return value;
}
export const config = convert(bad);
