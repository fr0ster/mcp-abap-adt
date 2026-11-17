// Refused (forbidden-key): a return statement of a function declared to return a config.
import type {
  ISapHttpConfig,
  ISapRfcConfig,
} from '@mcp-abap-adt/interfaces-auth-sap';

const bad = {
  connectionType: 'rfc' as const,
  authType: 'basic' as const,
  ashost: 'host',
  sysnr: '00',
  client: '100',
  language: 'EN',
  url: undefined,
};
export function build(): ISapRfcConfig {
  return bad;
}
export type Unused = ISapHttpConfig;
