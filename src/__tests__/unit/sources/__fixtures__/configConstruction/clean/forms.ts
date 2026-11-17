// Clean: every form, each value fitting its config type.
import type {
  ISapHttpConfig,
  ISapRfcConfig,
} from '@mcp-abap-adt/interfaces-auth-sap';

const good = {
  connectionType: 'rfc' as const,
  authType: 'basic' as const,
  ashost: 'host',
  sysnr: '00',
  client: '100',
  language: 'EN',
};
const goodHttp = {
  url: 'https://system.example.test',
  authType: 'basic' as const,
};
export const variable: ISapRfcConfig = good;
export class Holder {
  config: ISapRfcConfig = good;
}
let assigned: ISapRfcConfig | undefined;
export function set(): void {
  assigned = good;
}
export const read = () => assigned;
function use(config: ISapHttpConfig): string {
  return config.url;
}
export const used = use(goodHttp);
export function build(): ISapRfcConfig {
  return good;
}
export const arrow = (): ISapRfcConfig => good;
export const satisfied = good satisfies ISapRfcConfig;
export const configs: ISapRfcConfig[] = [good];
export const holder: { config: ISapRfcConfig } = { config: good };
const config = good;
export const short: { config: ISapRfcConfig } = { config };
export function withDefault(given: ISapRfcConfig = good): string {
  return given.client;
}
function answer() {
  return good;
}
const held = answer();
export const fromCall: ISapRfcConfig = held;
export const fromParens: ISapRfcConfig = (answer)();
declare const pick: boolean;
export const union: ISapRfcConfig = pick ? good : { ...good, client: '200' };
export const spread: ISapRfcConfig = { ...good, client: '200' };
