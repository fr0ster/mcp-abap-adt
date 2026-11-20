/**
 * One pinned request, kept apart from `pinCases.ts` (which fakes the clock
 * and spies) so a file can import a helper that names it without them.
 */

/** One request as sent: method, path with its query, every header, body. */
export interface PinnedRequest {
  method: string;
  url: string;
  headers: Readonly<Record<string, string>>;
  body: string | undefined;
}
