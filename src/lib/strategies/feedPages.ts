/**
 * A runtime feed read page by page, as SAP pages it.
 *
 * **What SAP does.** A feed answers at most 100 entries per request whatever
 * `$top` asks for: the feed descriptor declares `<feed:paging size="50"
 * max="100"/>`, a `$top=500` answered exactly 100 `atom:entry`, and `$skip`
 * is ignored — the same page came back (on premise and BTP ABAP environment,
 * 2026-09-30). What SAP offers instead is the `atom:link rel="next"` of a full
 * page, `…?$top=100&to=<timestamp>`: the same query, bounded above by the
 * oldest entry it answered.
 *
 * So a longer list is that link followed: the same request again with its
 * `to`, until the caller's count is reached, SAP stops offering a next page,
 * or the ceiling is hit. What remains is answered as `next_to`, which the
 * caller passes back as `to` to go on.
 */
import { rawOf } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { succeededWith } from './sequence';

/** The most one request answers — the descriptor's `paging max`. */
export const FEED_PAGE_MAX = 100;

/** The most one call of ours collects, however many are asked for. */
export const FEED_ENTRIES_CEILING = 1000;

export interface FeedPage<T> {
  entries: T[];
  /** The `to` of SAP's next page; absent when SAP offers none. */
  next_to?: string;
}

/**
 * The `to` of the `rel="next"` link, or nothing. Attributes are read in any
 * order and the href may carry the query encoded or with `&amp;`.
 */
export function nextToOf(xml: string): string | undefined {
  for (const match of xml.matchAll(/<(?:\w+:)?link\b([^>]*)\/?>/g)) {
    const attributes = match[1];
    if (!/\brel="next"/.test(attributes)) continue;
    const href = /\bhref="([^"]*)"/.exec(attributes)?.[1] ?? '';
    const to = /[?&;]to=([^&]*)/.exec(href.replace(/&amp;/g, '&'))?.[1];
    if (to) return decodeURIComponent(to);
  }
  return undefined;
}

/**
 * A feed reading that keeps the next page's `to` beside the entries — the
 * library's readings answer the entries alone.
 */
export function feedPage<T>(
  read: (answer: never) => T[],
): (answer: never) => FeedPage<T> {
  return (answer) => {
    const next_to = nextToOf(String(rawOf(answer as never) ?? ''));
    return next_to === undefined
      ? { entries: read(answer) }
      : { entries: read(answer), next_to };
  };
}

export interface FeedPaging {
  /** How many entries the caller wants; absent — one page of SAP's size. */
  maxResults?: number;
  /** The upper time bound the first request carries. */
  to?: string;
}

/** How an entry is told apart and when it was stamped. */
export interface FeedEntryIdentity<T> {
  keyOf: (entry: T) => string;
  /** The entry's time as an ISO-8601 instant, or nothing. */
  stampOf: (entry: T) => string | undefined;
}

/**
 * An ISO-8601 instant as a feed's `to` — `YYYYMMDDHHMMSS`, the form of SAP's
 * own next link, which carries the oldest entry's `atom:updated` in UTC.
 */
export function toBoundOf(stamp: string | undefined): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(
    stamp ?? '',
  );
  return match ? match.slice(1).join('') : undefined;
}

/**
 * Requests page after page until `maxResults` entries are collected, SAP
 * offers no next page, or {@link FEED_ENTRIES_CEILING} is reached.
 *
 * **`to` is inclusive.** The next page starts with the entries stamped with
 * the previous page's last second again (BTP ABAP environment, 2026-10-01:
 * four of them on one boundary). So an entry is kept once, by `keyOf`, and a
 * page asks for the entries still wanted plus the ones it will repeat: a page
 * that asked only for what was missing came back as nothing but repeats, its
 * next link naming the same `to`, and the list stopped short.
 *
 * When the count is reached part-way through a page, `next_to` is the last
 * answered entry's second — inclusive as SAP's own, so reading on repeats the
 * entries of that second rather than skipping any of them.
 *
 * A failing page answers as itself: what came before it is not a result the
 * caller asked for.
 */
export async function feedPages<T>(
  fetch: (page: {
    maxResults?: number;
    to?: string;
  }) => Promise<IAdtResponse<FeedPage<T>, IAdtError>>,
  paging: FeedPaging,
  identity: FeedEntryIdentity<T>,
): Promise<IAdtResponse<FeedPage<T>, IAdtError>> {
  if (paging.maxResults === undefined) {
    return fetch({ to: paging.to });
  }

  const wanted = Math.min(
    Math.max(1, Math.floor(paging.maxResults)),
    FEED_ENTRIES_CEILING,
  );
  const entries: T[] = [];
  const seen = new Set<string>();
  let to = paging.to;

  while (entries.length < wanted) {
    const repeats = to
      ? entries.filter((e) => toBoundOf(identity.stampOf(e)) === to).length
      : 0;
    const answer = await fetch({
      maxResults: Math.min(FEED_PAGE_MAX, wanted - entries.length + repeats),
      to,
    });
    if (!answer.ok) return answer;

    const page = answer.getResult().value;
    let added = 0;
    for (const entry of page.entries) {
      const key = identity.keyOf(entry);
      if (seen.has(key)) continue;
      if (entries.length === wanted) {
        // More on this page than wanted: read on from the last answered
        // entry's second.
        const last = entries[entries.length - 1];
        const bound = toBoundOf(identity.stampOf(last)) ?? page.next_to;
        return succeededWith(bound ? { entries, next_to: bound } : { entries });
      }
      seen.add(key);
      entries.push(entry);
      added++;
    }

    // No next page, or a page that moved nothing: SAP has nothing further
    // to give on this query.
    if (!page.next_to || added === 0) {
      return succeededWith({ entries });
    }
    to = page.next_to;
  }

  return succeededWith({ entries, next_to: to });
}
