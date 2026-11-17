// Refused (forbidden-key): a union source, one constituent carrying `url`.
import type { ISapRfcConfig } from '@mcp-abap-adt/interfaces-auth-sap';

const bad = {
  connectionType: 'rfc' as const,
  authType: 'basic' as const,
  ashost: 'host',
  sysnr: '00',
  client: '100',
  language: 'EN',
  url: undefined,
};
const good = {
  connectionType: 'rfc' as const,
  authType: 'basic' as const,
  ashost: 'host',
  sysnr: '00',
  client: '100',
  language: 'EN',
};
// A declared union, not reduced by subtype: one constituent carries `url`.
declare const source: typeof good | typeof bad;
export const config: ISapRfcConfig = source;
