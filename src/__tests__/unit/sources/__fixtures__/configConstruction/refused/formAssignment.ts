// Refused (forbidden-key): an assignment to a config-typed variable.
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
let config: ISapRfcConfig | undefined;
export function set(): ISapRfcConfig | undefined {
  config = bad;
  return undefined;
}
export const read = () => config;
export type Unused = ISapHttpConfig;
