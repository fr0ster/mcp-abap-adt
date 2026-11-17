// Refused (forbidden-key): an unannotated function's answer held by a variable, used as an RFC config.
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
const answer = build();
export const config: ISapRfcConfig = answer;
