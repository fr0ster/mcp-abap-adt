import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  child,
  localName,
  text,
  type XmlList,
  type XmlNode,
  type XmlRead,
} from '../xml/tree';
import {
  attributeOf,
  membersNamed,
  parseStructure,
  walkStructure,
} from './reading';

/**
 * The query variants of every feed, read out of the feed list.
 *
 * **Where they are.** On premise each feed's variants come inside the feed
 * list itself — `GET /sap/bc/adt/feeds`, one `atom:entry` per feed, its
 * `feed:extendedData/feed:queryVariants/feed:queryVariant` carrying `title`,
 * `queryString` and `isDefault`. `GET /sap/bc/adt/feeds/variants?category=…`
 * answered 200 with an empty body for every one of the seven feed ids a system listed
 * (2026-09-26). So this is a reading of the answer `list()` already fetches,
 * not a request of its own.
 *
 * The library's reading of that answer (`parseFeedDescriptors`) keeps the
 * feeds and drops their variants; this one keeps the variants. Feeds with
 * none are left out.
 */
export interface FeedVariants {
  feed: string;
  title: string;
  variants: Array<{ title: string; query: string; is_default: boolean }>;
}

/** A feed's own text member (`atom:id`, `atom:title`): text, CDATA included, `''` when none. */
function textOf(entry: XmlRead, name: string): string {
  return text(child(entry, name)) ?? '';
}

/** The feed list's variants: the library's result strategy for its `feeds` slot. */
export function feedVariantsOf(
  answer: Pick<IAdtWireResponse, 'data'>,
): FeedVariants[] {
  const feeds: FeedVariants[] = [];
  // The wire's body is a boundary: anything but text reads as no document.
  const body = answer?.data;
  const document = typeof body === 'string' ? parseStructure(body) : null;
  for (const entry of membersNamed(document, 'atom:entry')) {
    const variants = walkStructure(entry.node)
      .filter((visit) => localName(visit.name) === 'queryVariant')
      .map((visit) => ({
        title: attributeOf(visit.node, 'title') ?? '',
        query: attributeOf(visit.node, 'queryString') ?? '',
        is_default: attributeOf(visit.node, 'isDefault') === 'true',
      }));
    if (variants.length === 0) continue;
    feeds.push({
      feed: textOf(entry.node, 'atom:id'),
      title: textOf(entry.node, 'atom:title'),
      variants,
    });
  }
  return feeds;
}
