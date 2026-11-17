// Refused (unannotated-return): a function with no return type, its answer
// used as an RFC config; its literal carries `url: undefined`.
import type { ISapRfcConfig } from '@mcp-abap-adt/interfaces-auth-sap';

function build() {
  return {
    connectionType: 'rfc' as const,
    authType: 'basic' as const,
    ashost: 'host',
    sysnr: '00',
    client: '100',
    language: 'EN',
    url: undefined,
  };
}
export const config: ISapRfcConfig = build();
