// Clean: a parsed value checked into its shape, no value at all, and a key typed `never`.
import type { ISapRfcConfig } from '@mcp-abap-adt/interfaces-auth-sap';

function rfcOf(raw: string): ISapRfcConfig {
  const client = raw.trim();
  return {
    connectionType: 'rfc',
    authType: 'basic',
    ashost: 'host',
    sysnr: '00',
    client,
    language: 'EN',
  };
}
export const parsed: ISapRfcConfig = rfcOf('100');
export const none: ISapRfcConfig | undefined = undefined;
const omitted: {
  connectionType: 'rfc';
  authType: 'basic';
  ashost: string;
  sysnr: string;
  client: string;
  language: string;
  url?: never;
} = {
  connectionType: 'rfc',
  authType: 'basic',
  ashost: 'host',
  sysnr: '00',
  client: '100',
  language: 'EN',
};
export const config: ISapRfcConfig = omitted;
