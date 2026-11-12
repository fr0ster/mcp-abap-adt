/**
 * One pinned request, kept apart from `pinCases.ts` (which uses Jest's
 * clock and spies) so a node:test file can import a helper that names it.
 */

/** One request as sent: method, path with its query, every header, body. */
export interface PinnedRequest {
  method: string;
  url: string;
  headers: Readonly<Record<string, string>>;
  body: string | undefined;
}
