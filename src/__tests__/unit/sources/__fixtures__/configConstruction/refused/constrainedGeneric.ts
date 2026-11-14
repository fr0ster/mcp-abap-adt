// Refused (forbidden-key): the argument of a config-constrained generic —
// its parameter's contextual type is a config, so the caller's value is
// checked where it is passed (a known limit until the guard read types
// under exactOptionalPropertyTypes).
import type { ISapRfcConfig } from '@mcp-abap-adt/interfaces-auth-sap';

const bad: {
  connectionType: 'rfc';
  authType: 'basic';
  ashost: string;
  sysnr: string;
  client: string;
  language: string;
  url: undefined;
} = {
  connectionType: 'rfc',
  authType: 'basic',
  ashost: 'host',
  sysnr: '00',
  client: '100',
  language: 'EN',
  url: undefined,
};
function convert<T extends ISapRfcConfig>(value: T): ISapRfcConfig {
  return value;
}
export const config = convert(bad);
