// Refused (forbidden-key): a class property initializer with a declared config type.
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
export class Holder {
  config: ISapRfcConfig = bad;
}
export type Unused = ISapHttpConfig;
