/**
 * The line match of `SearchSource`: which lines of a source are hits. A
 * strategy the orchestrator is given explicitly (`OrchestratorDeps.lineMatch`)
 * and has none of its own; the shipped one is `substringLineMatch`
 * (`lineScanner.ts`), wired by the handler.
 */

/** What a source is matched against: the call's terms and the object's hit limit. */
export interface ScanInput {
  query: string;
  query2?: string | undefined;
  exclude?: string[] | undefined;
  exclude_comments?: boolean | undefined;
  /** The most hits to answer, past which `capped` is set; absent, no limit. */
  max_hits?: number | undefined;
}

/** A matched line: its 1-based number and its text. */
export interface ScanHit {
  line: number;
  snippet: string;
}

/** The hits of one source, and whether a hit past `max_hits` was left out. */
export interface ScanResult {
  hits: ScanHit[];
  capped: boolean;
}

/** A line match: one source's lines and the scan input in, its hits out. */
export interface LineMatchStrategy {
  match(lines: readonly string[], input: ScanInput): ScanResult;
  /**
   * `true` when a hit is only ever a line holding `query` (in either case),
   * so a source without the query holds no hit: with `max_hits`, the scan is
   * not repeated after a step whose sources hold no query. Absent: every
   * step is scanned.
   */
  readonly hitsHoldQuery?: boolean;
}
