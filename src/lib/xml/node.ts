import type { XMLParser } from 'fast-xml-parser';

/**
 * A node of a parsed XML document, typed at the parse: what fast-xml-parser
 * answers under the options the server parses with, checked once where the
 * document is parsed ({@link parseXml}) and typed so everywhere after.
 *
 * - a **text value**: a string; a number or a boolean where a parser coerces
 *   values (`parseTagValue`, `parseAttributeValue`);
 * - an **element** ({@link XmlElement}): its members by name — its child
 *   elements, its attributes (by the parser's prefix, or grouped under one
 *   member), its text member (`#text` by default), each a node;
 * - a **list** ({@link XmlList}): a member that repeats, a member the parser
 *   always lists (`isArray`), or the members of the ordered form.
 *
 * The parser answers no other value: no `null`, no `undefined`, no other
 * object (`src/__tests__/unit/xml/node.test.ts`, over the recorded corpus).
 */
export type XmlNode = XmlText | XmlElement | XmlList;

/** A text value of a parsed document ({@link XmlNode}). */
export type XmlText = string | number | boolean;

/** A list of a parsed document ({@link XmlNode}). */
export type XmlList = readonly XmlNode[];

/** An element of a parsed document: its members by name ({@link XmlNode}). */
export interface XmlElement {
  readonly [name: string]: XmlNode;
}

/**
 * `value` as a node, built afresh from what it holds, or `undefined` when it,
 * or anything it holds, is not one: plain code over the parser's output, the
 * one check its values pass.
 */
export function xmlNodeOf(value: unknown): XmlNode | undefined {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const items: XmlNode[] = [];
    for (const item of value) {
      const node = xmlNodeOf(item);
      if (node === undefined) return undefined;
      items.push(node);
    }
    return items;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  // Built by `Object.fromEntries`, which defines each member as its own: a
  // member named `__proto__` stays a member, never the copy's prototype.
  const members: [string, XmlNode][] = [];
  for (const [name, member] of Object.entries(value)) {
    const node = xmlNodeOf(member);
    if (node === undefined) return undefined;
    members.push([name, node]);
  }
  return Object.fromEntries(members);
}

/**
 * `document` parsed by `parser` and checked ({@link xmlNodeOf}): the one place
 * a parser's answer — `any` to the compiler — is read. A parser's throw is
 * the caller's, as it was; `undefined` when the answer is not a node.
 */
export function parseXml(
  parser: XMLParser,
  document: string | Uint8Array,
): XmlNode | undefined {
  const parsed: unknown = parser.parse(document);
  return xmlNodeOf(parsed);
}
