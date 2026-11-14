// Refused (forbidden-key): an object element whose contextual type is a config.
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
export const holder: { config: ISapRfcConfig } = { config: bad };
export type Unused = ISapHttpConfig;
