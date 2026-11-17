// Refused (forbidden-key): a call argument whose parameter is an HTTP config, carrying an RFC key.
import type {
  ISapHttpConfig,
  ISapRfcConfig,
} from '@mcp-abap-adt/interfaces-auth-sap';

const badHttp = {
  url: 'https://system.example.test',
  authType: 'basic' as const,
  ashost: undefined,
};
function use(config: ISapHttpConfig): string {
  return config.url;
}
export const used = use(badHttp);
export type Unused = ISapRfcConfig;
