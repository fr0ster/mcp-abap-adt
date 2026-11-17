// Clean: `url?: T` instantiated with `never` — the key is absent (Codex's
// reproduction 1: a written-type reading saw the unsubstituted `T`).
import type {
  ISapRfcApplicationServer,
  ISapRfcConfig,
} from '@mcp-abap-adt/interfaces-auth-sap';

type Box<T> = { url?: T };
declare const source: Omit<ISapRfcApplicationServer, 'url'> & Box<never>;
export const config: ISapRfcConfig = source;
