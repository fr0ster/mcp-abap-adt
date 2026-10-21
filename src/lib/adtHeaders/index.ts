/**
 * `@mcp-abap-adt/lib/adt-headers`: what an embedder needs to send the same
 * ADT request headers the server sends and to apply the same one-shot
 * `406`/`415` correction (docs/architecture/REQUEST_HEADERS.md):
 *
 * - `DEFAULT_ADT_HEADERS`, the default pair per operation, with
 *   `AdtOperation` / `adtOperation`;
 * - `AdtHeaderPairs`, the owner of the corrected pairs (one per process),
 *   and its per-system `AdtHeaderPort`;
 * - `adtSystemKey`, the system key the server keys the pairs by;
 * - `withAdtHeaders`, a call with the system's pair, corrected once on a
 *   `406`/`415`, and its `AdtHeadersContext`.
 *
 * The batch-mode scope (`adtCallScope`, `asRecordedCall`), the correction's
 * own reader (`correctedPair`) and the server's context reader
 * (`adtHeadersOf`) stay internal.
 */
export { AdtHeaderPairs, type AdtHeaderPort } from './AdtHeaderPairs';
export {
  type AdtObjectWith,
  type AdtOperation,
  adtOperation,
  DEFAULT_ADT_HEADERS,
} from './defaultPairs';
export { adtSystemKey } from './systemKey';
export { type AdtHeadersContext, withAdtHeaders } from './withAdtHeaders';
