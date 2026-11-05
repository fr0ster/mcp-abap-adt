import {
  buildOrdered,
  escapeOrderedText,
  isWellFormed,
  ORDERED_ATTRIBUTES,
  ORDERED_CDATA,
  ORDERED_TEXT,
  type OrderedElement,
  orderedElement,
  orderedElements,
  orderedHoldsMarkup,
  parseOrdered,
  replaceOrderedMember,
} from '../xml/ordered';
import { child, type Element, isElement, isList } from '../xml/tree';

/**
 * Patching an XML document in place, for the read-modify-write an update is.
 *
 * adt-clients did this inside the member until 19, which removed it: a member
 * that made several requests had already chosen an order, and `update` now
 * takes the whole document and replaces with it. So the read, the patch and the
 * write are the consumer's, and this is the patch half — ported from the
 * implementation at the `18.0.2` tag rather than reinvented.
 *
 * **Why patch the document and not build one.** The document carries fields
 * nobody here knows about — `abapLanguageVersion`, links, SAP-managed state —
 * and building one from the fields a caller named would drop every one of
 * them. So the document is read with the XML parser in its order
 * (`xml/ordered`), the one value is changed in that structure, and the
 * document is built back with the same options: everything else comes back
 * as it came (what the round trip does not keep is listed there — an
 * apostrophe in an attribute value is written `&apos;`).
 *
 * **Every patch fails loudly when it cannot find its target**, and that is the
 * point rather than a detail. It was learned from a live failure: a domain
 * whose description was present in the configuration all along was rejected
 * with `The description is missing for ZAC_DOM01`. The chain was a read that
 * came back slow — ADT answers a read of a not-yet-ready object with **200 and
 * an empty body**, never a 404 — then a `String.replace` that found nothing and
 * returned its input unchanged, and finally a PUT without a description that
 * the server blamed on the caller. What these helpers control is not the
 * system's response time; it is what a slow read turns into.
 */

/** Raised when a patch cannot find what it was asked to change. */
export class XmlPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XmlPatchError';
  }
}

const NOT_PRESENT =
  'This usually means the preceding read returned an empty or partial body — ' +
  'ADT answers a read of a not-yet-ready object with HTTP 200 and no content ' +
  'rather than an error.';

/** No patch finds what it was asked to change: there is no case where quietly passing the XML through is right. */
function notPresent(target: string): XmlPatchError {
  return new XmlPatchError(
    `Cannot patch ${target}: it is not present in the XML being updated. ${NOT_PRESENT}`,
  );
}

/** `value` written as XML text: `&`, `<` and `>` as entities. */
const escapeXml = escapeOrderedText;

/**
 * The document in its order. A body that is not well-formed — a read cut
 * short among them, which the parser alone would close and read — is refused:
 * patched, it would go back to SAP without what the read did not carry.
 */
function membersOf(xml: string): readonly unknown[] {
  if (xml.trim() !== '' && !isWellFormed(xml)) {
    throw new XmlPatchError(
      `Cannot patch: the XML being updated is not a complete XML document. ${NOT_PRESENT}`,
    );
  }
  const parsed = parseOrdered(xml);
  return isList(parsed) ? parsed : [];
}

const element = orderedElement;

/** An element's attributes, `undefined` when it has none. */
function attributesOf(target: OrderedElement): Element | undefined {
  const attributes = child(target.member, ORDERED_ATTRIBUTES);
  return isElement(attributes) ? attributes : undefined;
}

/** The document built back with `target` replaced by `replacement`. */
function rebuilt(
  members: readonly unknown[],
  target: OrderedElement,
  replacement: readonly unknown[],
): string {
  return buildOrdered(
    replaceOrderedMember(members, target.member, replacement),
  );
}

/**
 * `adtcore:description="old"` becomes `adtcore:description="new"`: the
 * attribute on the first element, in document order, that carries it.
 */
export function patchXmlAttribute(
  xml: string,
  attrName: string,
  newValue: string,
): string {
  const members = membersOf(xml);
  const target = orderedElements(members).find(
    (each) => attributesOf(each)?.[attrName] !== undefined,
  );
  if (!target) throw notPresent(`attribute ${attrName}`);
  return rebuilt(members, target, [
    element(target.name, target.content, {
      ...attributesOf(target),
      [attrName]: escapeXml(newValue),
    }),
  ]);
}

/**
 * Element text: the first element so named that holds text alone — text,
 * CDATA, or nothing, as the self-closing `<tag/>` — gets `newValue` as its
 * text, or nothing when `newValue` is empty.
 */
export function patchXmlElement(
  xml: string,
  tagName: string,
  newValue: string,
): string {
  const members = membersOf(xml);
  const target = orderedElements(members).find(
    (each) =>
      each.name === tagName &&
      !orderedHoldsMarkup(
        each.content.filter(
          (member) => child(member, ORDERED_CDATA) === undefined,
        ),
      ),
  );
  if (!target) throw notPresent(`element <${tagName}>`);
  const content =
    newValue === '' ? [] : [{ [ORDERED_TEXT]: escapeXml(newValue) }];
  return rebuilt(members, target, [
    element(tagName, content, attributesOf(target)),
  ]);
}

/**
 * An attribute on a named element.
 *
 * Unlike the others this one **adds** the attribute when the element is there
 * without it, because that is a state ADT genuinely produces for an unset
 * reference — `<doma:valueTableRef/>` for a domain with no value table,
 * `<pak:superPackage/>` for a package with no parent. Refusing those would
 * forbid ever setting one for the first time. Only a missing element throws.
 */
export function patchXmlElementAttribute(
  xml: string,
  elementTag: string,
  attrName: string,
  newValue: string,
): string {
  const members = membersOf(xml);
  const named = orderedElements(members).filter(
    (each) => each.name === elementTag,
  );
  const target =
    named.find((each) => attributesOf(each)?.[attrName] !== undefined) ??
    named[0];
  if (!target) {
    throw new XmlPatchError(
      `Cannot patch attribute ${attrName}: element <${elementTag}> is not present in the XML being updated. ${NOT_PRESENT}`,
    );
  }
  return rebuilt(members, target, [
    element(elementTag, target.content, {
      ...attributesOf(target),
      [attrName]: escapeXml(newValue),
    }),
  ]);
}

/**
 * A whole block, opening tag to closing tag, nesting and all: the first
 * element so named is replaced by `newContent`, the caller's markup, read with
 * the same parser.
 */
export function patchXmlBlock(
  xml: string,
  tagName: string,
  newContent: string,
): string {
  const members = membersOf(xml);
  const target = orderedElements(members).find((each) => each.name === tagName);
  if (!target) throw notPresent(`block <${tagName}>`);
  // The content is the caller's markup: well-formed, and an element at least —
  // text alone, or nothing, would delete the block.
  const replacement = isWellFormed(newContent)
    ? parseOrdered(newContent)
    : null;
  if (!isList(replacement) || orderedElements(replacement).length === 0) {
    throw new XmlPatchError(
      `Cannot patch block <${tagName}>: the content to write is not a well-formed XML element.`,
    );
  }
  return rebuilt(members, target, replacement);
}

/** Apply a patch only when the caller named a value. */
export function patchIf<T>(
  xml: string,
  value: T | undefined | null,
  patchFn: (xml: string, value: T) => string,
): string {
  if (value === undefined || value === null) return xml;
  return patchFn(xml, value);
}

/**
 * Take the XML out of a read, refusing anything that cannot be patched.
 *
 * An empty body passes through quietly otherwise, and an empty body is exactly
 * what ADT returns for an object that is not ready yet.
 */
export function extractXmlString(data: unknown, what = 'object'): string {
  if (typeof data !== 'string') {
    const kind =
      data === null || data === undefined ? String(data) : typeof data;
    throw new XmlPatchError(
      `Cannot update ${what}: the read returned ${kind}, not XML.`,
    );
  }
  const xml = data.trim();
  if (xml === '' || !xml.startsWith('<')) {
    throw new XmlPatchError(
      `Cannot update ${what}: the read returned ${xml === '' ? 'an empty body' : 'a body that is not XML'}. ` +
        'ADT answers a read of a not-yet-ready object with HTTP 200 and no content, so the status alone does not show this.',
    );
  }
  return xml;
}
