// Refused (forbidden-property): the function declares its return type, and
// its literal carries a key that type forbids.
import type { ISapRfcConfig } from '@mcp-abap-adt/interfaces-auth-sap';

function build(): ISapRfcConfig {
  return {
    connectionType: 'rfc',
    authType: 'basic',
    ashost: 'host',
    sysnr: '00',
    client: '100',
    language: 'EN',
    url: undefined,
  };
}
export const config: ISapRfcConfig = build();
