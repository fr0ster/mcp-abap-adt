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
import type {
  IAdtError,
  IAdtResponse,
  IResultStrategy,
} from '@mcp-abap-adt/interfaces-adt';
import { isAsciiDigit } from '../plainText';
import {
  localName,
  type XmlList,
  type XmlNode,
  type XmlRead,
} from '../xml/tree';
import { attributeOf, parseStructure, walkStructure } from './reading';
import { succeededWith } from './sequence';

/**
 * What a request without `$top` answers — the descriptor's `paging size`.
 * It is the count a caller who names none gets, read the same way as any
 * other, so its `next_to` is ours and not SAP's inclusive link.
 */
export const FEED_PAGE_DEFAULT = 50;

/** The most one request answers — the descriptor's `paging max`. */
export const FEED_PAGE_MAX = 100;

/** The most one call of ours collects, however many are asked for. */
export const FEED_ENTRIES_CEILING = 1000;

export interface FeedPage<T> {
  entries: T[];
  /** The `to` of SAP's next page; absent when SAP offers none. */
  next_to?: string;
  /**
   * A second holding more entries than one request answers: SAP pages by
   * time alone, so the ones beyond these cannot be reached by `to`.
   */
  incomplete_second?: string;
}

/**
 * The `to` of the `rel="next"` link, or nothing: a `link` element of any
 * prefix, at any depth, read through the XML parser.
 */
export function nextToOf(xml: string): string | undefined {
  for (const visit of walkStructure(parseStructure(xml))) {
    if (localName(visit.name) !== 'link') continue;
    if (attributeOf(visit.node, 'rel') !== 'next') continue;
    // The parser has decoded the attribute: `&amp;` is `&` here.
    const href = attributeOf(visit.node, 'href') ?? '';
    const to = toParameterOf(href);
    if (to) return decodeURIComponent(to);
  }
  return undefined;
}

/**
 * The value of the first `to=` parameter of `href` — one after `?`, `&` or
 * `;` — up to the next `&`; `undefined` when there is none.
 */
function toParameterOf(href: string): string | undefined {
  for (
    let at = href.indexOf('to=');
    at !== -1;
    at = href.indexOf('to=', at + 1)
  ) {
    if (at === 0 || !'?&;'.includes(href.charAt(at - 1))) continue;
    const end = href.indexOf('&', at + 3);
    return href.slice(at + 3, end === -1 ? href.length : end);
  }
  return undefined;
}

/**
 * A feed reading that keeps the next page's `to` beside the entries — the
 * library's readings answer the entries alone.
 */
export function feedPage<T>(
  read: IResultStrategy<T[]>,
): IResultStrategy<FeedPage<T>> {
  return (answer) => {
    const next_to = nextToOf(rawOf(answer));
    return next_to === undefined
      ? { entries: read(answer) }
      : { entries: read(answer), next_to };
  };
}

export interface FeedPaging {
  /** How many entries the caller wants; absent — {@link FEED_PAGE_DEFAULT}. */
  maxResults?: number | undefined;
  /** The upper time bound the first request carries. */
  to?: string | undefined;
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
  const text = stamp ?? '';
  // `YYYY-MM-DDTHH:MM:SS`: digits where the form has them, its separators between.
  const form = 'dddd-dd-ddTdd:dd:dd';
  if (text.length < form.length) return undefined;
  let bound = '';
  for (let at = 0; at < form.length; at++) {
    const wanted = form.charAt(at);
    const character = text.charAt(at);
    if (wanted === 'd') {
      if (!isAsciiDigit(character)) return undefined;
      bound += character;
    } else if (character !== wanted) {
      return undefined;
    }
  }
  return bound;
}

/** The second before a `to` bound — `to` is inclusive, so this excludes it. */
export function secondBefore(bound: string): string {
  const [y, mo, d, h, mi, se] = [0, 4, 6, 8, 10, 12].map((at, i) =>
    Number(bound.slice(at, at + (i === 0 ? 4 : 2))),
  );
  const before = new Date(Date.UTC(y, mo - 1, d, h, mi, se) - 1000);
  return [...before.toISOString()]
    .filter((character) => isAsciiDigit(character))
    .join('')
    .slice(0, 14);
}

/**
 * Requests page after page until `maxResults` entries are collected, SAP
 * offers no next page, or {@link FEED_ENTRIES_CEILING} is reached.
 *
 * **`to` is inclusive.** The next page starts with the entries stamped with
 * the previous page's last second again (BTP ABAP environment, 2026-10-01:
 * four of them on one boundary). Within one call an entry is kept once, by
 * `keyOf`, and a page asks for the entries still wanted plus the ones it will
 * repeat: a page that asked only for what was missing came back as nothing
 * but repeats, its next link naming the same `to`, and the list stopped
 * short.
 *
 * **Between calls nothing is remembered, so the answer never ends inside a
 * second.** `next_to` names a second, and the answer holds only entries newer
 * than it: the entries of that second are left to the next call, whose
 * `to: next_to` starts with exactly them. To still answer the count, one entry
 * beyond it is read — where the cut falls tells which second is the boundary.
 *
 * **A second holding more entries than were asked is answered whole.**
 * Leaving it to the next call would leave it there forever: the next call
 * starts with the same second and cuts it again. So the second is read on its
 * own — one request bounded by it, the most SAP answers — and answered whole,
 * more than asked, with `next_to` the second before it. SAP pages by time
 * alone, so a second holding more than one request answers cannot be read
 * past its first {@link FEED_PAGE_MAX}; the answer says so in
 * `incomplete_second` and reads on from the second before.
 *
 * A failing page answers as itself: what came before it is not a result the
 * caller asked for.
 */
export async function feedPages<T>(
  fetch: (page: {
    maxResults?: number;
    to?: string | undefined;
  }) => Promise<IAdtResponse<FeedPage<T>, IAdtError>>,
  paging: FeedPaging,
  identity: FeedEntryIdentity<T>,
): Promise<IAdtResponse<FeedPage<T>, IAdtError>> {
  const wanted = Math.min(
    Math.max(1, Math.floor(paging.maxResults ?? FEED_PAGE_DEFAULT)),
    FEED_ENTRIES_CEILING,
  );
  // One beyond the count: the first entry not answered marks the boundary.
  const reading = wanted + 1;
  const entries: T[] = [];
  const seen = new Set<string>();
  let to = paging.to;
  let exhausted = false;
  let lastNext: string | undefined;

  while (entries.length < reading) {
    const repeats = to
      ? entries.filter((e) => toBoundOf(identity.stampOf(e)) === to).length
      : 0;
    const answer = await fetch({
      maxResults: Math.min(FEED_PAGE_MAX, reading - entries.length + repeats),
      to,
    });
    if (!answer.ok) return answer;

    const page = answer.getResult().value;
    let added = 0;
    for (const entry of page.entries) {
      const key = identity.keyOf(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
      added++;
    }
    lastNext = page.next_to;

    // No next page, or a page that moved nothing: SAP has nothing further
    // to give on this query.
    if (!page.next_to || added === 0) {
      exhausted = true;
      break;
    }
    to = page.next_to;
  }

  if (entries.length <= wanted) {
    return succeededWith(
      exhausted || !lastNext ? { entries } : { entries, next_to: lastNext },
    );
  }

  const answered = entries.slice(0, wanted);
  const boundary = toBoundOf(identity.stampOf(entries[wanted]));
  if (!boundary) {
    // A feed whose entries carry no time: SAP's own link is all there is.
    return succeededWith(
      lastNext
        ? { entries: answered, next_to: lastNext }
        : { entries: answered },
    );
  }
  const newer = answered.filter(
    (e) => toBoundOf(identity.stampOf(e)) !== boundary,
  );
  if (newer.length > 0) {
    return succeededWith({ entries: newer, next_to: boundary });
  }

  // Every wanted entry is of the boundary second: read that second alone.
  const crowded = await fetch({ maxResults: FEED_PAGE_MAX, to: boundary });
  if (!crowded.ok) return crowded;
  const page = crowded.getResult().value;
  const ofSecond = page.entries.filter(
    (e) => toBoundOf(identity.stampOf(e)) === boundary,
  );
  const whole =
    ofSecond.length < page.entries.length ||
    page.entries.length < FEED_PAGE_MAX ||
    !page.next_to;
  const more = ofSecond.length < page.entries.length || !!page.next_to;
  const answeredSecond: FeedPage<T> = { entries: ofSecond };
  if (more) answeredSecond.next_to = secondBefore(boundary);
  if (!whole) answeredSecond.incomplete_second = boundary;
  return succeededWith(answeredSecond);
}
