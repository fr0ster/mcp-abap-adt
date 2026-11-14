// Refused (forbidden-key): a parameter's default value, the parameter a config.
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
export function use(config: ISapRfcConfig = bad): string {
  return config.client;
}
export type Unused = ISapHttpConfig;
