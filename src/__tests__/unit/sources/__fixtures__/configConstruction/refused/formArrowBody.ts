// Refused (forbidden-key): an arrow function's expression body, declared to return a config.
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
export const build = (): ISapRfcConfig => bad;
export type Unused = ISapHttpConfig;
