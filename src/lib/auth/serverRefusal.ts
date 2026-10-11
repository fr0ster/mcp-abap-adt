/**
 * The server's own refusals (spec §7.3, D17): fixed words, coded, decided by
 * the server before anything reaches a provider or a connection. They are not
 * chain failures — no `kind`, no `refusal` — and carry nothing read from a
 * file, a header or a server.
 */

/** The codes of the server's own refusals, as the answer's `error` names them. */
export type ServerRefusalCode = 'inspection_only';

/** Inspection-only mode: stdio started without a destination (D17). */
export const INSPECTION_ONLY_WORDS =
  'inspection-only mode: no connection parameters. To connect to an SAP system, use --mcp=<destination> or --env-path=<path>.';

const WORDS: Readonly<Record<ServerRefusalCode, string>> = {
  inspection_only: INSPECTION_ONLY_WORDS,
};

export class ServerRefusal extends Error {
  /** Which refusal: the answer's `error`. */
  readonly serverRefusal: ServerRefusalCode;

  constructor(code: ServerRefusalCode) {
    super(WORDS[code]);
    this.name = 'ServerRefusal';
    this.serverRefusal = code;
  }
}
