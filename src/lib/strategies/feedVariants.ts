/**
 * The query variants of every feed, read out of the feed list.
 *
 * **Where they are.** On premise each feed's variants come inside the feed
 * list itself — `GET /sap/bc/adt/feeds`, one `atom:entry` per feed, its
 * `feed:extendedData/feed:queryVariants/feed:queryVariant` carrying `title`,
 * `queryString` and `isDefault`. `GET /sap/bc/adt/feeds/variants?category=…`
 * answered 200 with an empty body for every one of E19's seven feed ids
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

const decode = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const attribute = (attributes: string, name: string): string =>
  decode(new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1] ?? '');

export function feedVariantsOf(answer: { data?: unknown }): FeedVariants[] {
  const xml = String(answer?.data ?? '');
  const feeds: FeedVariants[] = [];
  for (const entry of xml.split(/<atom:entry[\s>]/).slice(1)) {
    const variants = [
      ...entry.matchAll(/<\w+:queryVariant\b([^>]*?)\/?>/g),
    ].map((match) => ({
      title: attribute(match[1], 'title'),
      query: attribute(match[1], 'queryString'),
      is_default: attribute(match[1], 'isDefault') === 'true',
    }));
    if (variants.length === 0) continue;
    feeds.push({
      feed: decode(/<atom:id>([^<]*)<\/atom:id>/.exec(entry)?.[1] ?? ''),
      title: decode(
        /<atom:title[^>]*>([^<]*)<\/atom:title>/.exec(entry)?.[1] ?? '',
      ),
      variants,
    });
  }
  return feeds;
}
