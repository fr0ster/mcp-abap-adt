// Known limit: the checker merges `never & undefined` to `never`; the
// production compile (without the flag) would accept a value with
// `url: undefined` of this type — recorded as a known limit.
import type {
  ISapRfcApplicationServer,
  ISapRfcConfig,
} from '@mcp-abap-adt/interfaces-auth-sap';

declare const source: ISapRfcApplicationServer & { url?: undefined };
export const config: ISapRfcConfig = source;
