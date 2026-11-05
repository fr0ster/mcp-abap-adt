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
 * both quotes in every attribute value), whitespace outside the root
 * element is dropped, and a CR LF line end is read as LF (XML 1.0 §2.11). Every document of the corpus (`tests/fixtures/adt`)
 * builds back to its own bytes but for those apostrophes
 * (`src/__tests__/unit/xml/ordered.test.ts`).
 *
 * A node here is what the parser answered — outside the type system — and is
 * read with the `tree` helpers: a list of members, each an element whose one
 * name other than {@link ORDERED_ATTRIBUTES} holds its own list.
 */
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { child, entries, listOf, text } from './tree';

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

/** The text member of the ordered form. */
export const ORDERED_TEXT = '#text';
/** The CDATA member of the ordered form: a list holding its text member. */
export const ORDERED_CDATA = '#cdata';

/** An element of the ordered form: its name, the member it is, and its content. */
export interface OrderedElement {
  readonly name: string;
  readonly member: unknown;
  readonly content: readonly unknown[];
}

/** Every element of the ordered form at any depth, in document order: an element before what it holds. */
export function orderedElements(members: unknown): OrderedElement[] {
  const found: OrderedElement[] = [];
  const visit = (list: unknown): void => {
    for (const member of listOf(list)) {
      for (const [name, content] of entries(member)) {
        if (
          name === ORDERED_ATTRIBUTES ||
          name === ORDERED_TEXT ||
          name === ORDERED_CDATA ||
          name.startsWith('?') ||
          name.startsWith('#')
        ) {
          continue;
        }
        found.push({ name, member, content: listOf(content) });
        visit(content);
      }
    }
  };
  visit(members);
  return found;
}

/** The text an element's content holds directly, as it came (entities kept). */
export function orderedText(content: readonly unknown[]): string {
  return content
    .map((member) => text(child(member, ORDERED_TEXT)) ?? '')
    .join('');
}

/** The CDATA an element's content holds directly, its sections joined. */
export function orderedCdata(content: readonly unknown[]): string {
  return content
    .map((member) => orderedText(listOf(child(member, ORDERED_CDATA))))
    .join('');
}

/** Whether an element's content holds anything but text: an element, CDATA, a comment. */
export function orderedHoldsMarkup(content: readonly unknown[]): boolean {
  return content.some((member) =>
    entries(member).some(([name]) => name !== ORDERED_TEXT),
  );
}
