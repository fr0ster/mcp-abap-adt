/**
 * A document in its order, for the readers that hand part of it back as text
 * and the patches that write it back: fast-xml-parser's ordered form, parsed
 * and built with the same options.
 *
 * **The round trip leaves the text as it came.** Entities are not decoded and
 * not encoded, whitespace between elements is kept, CDATA and comments are
 * kept as such, attributes stay in their order with their prefixes, and the
 * declaration stays. What it does not keep: an empty element is written
 * self-closing (`<a></a>` becomes `<a/>`), an attribute is written in double
 * quotes with an apostrophe in its value as `&apos;` (the builder escapes
 * both quotes in every attribute value), and whitespace outside the root
 * element is dropped. Every document of the corpus (`tests/fixtures/adt`)
 * builds back to its own bytes but for those apostrophes
 * (`src/__tests__/unit/xml/ordered.test.ts`).
 *
 * A node here is what the parser answered — outside the type system — and is
 * read with the `tree` helpers: a list of members, each an element whose one
 * name other than {@link ORDERED_ATTRIBUTES} holds its own list.
 */
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

/** The member of an ordered element that holds its attributes. */
export const ORDERED_ATTRIBUTES = ':@';

const OPTIONS = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: false,
  cdataPropName: '#cdata',
  commentPropName: '#comment',
} as const;

const parser = new XMLParser(OPTIONS);
const builder = new XMLBuilder({ ...OPTIONS, suppressEmptyNode: true });

/** The document in its order, or `null` for a body that is empty or not XML. */
export function parseOrdered(document: string): unknown {
  if (document.trim() === '') return null;
  try {
    return parser.parse(document);
  } catch {
    return null;
  }
}

/** Members of the ordered form, written back as text. */
export function buildOrdered(members: readonly unknown[]): string {
  return builder.build(members);
}
