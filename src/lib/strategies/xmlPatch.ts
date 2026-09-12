/**
 * Patching an XML document in place, for the read-modify-write an update is.
 *
 * adt-clients did this inside the member until 19, which removed it: a member
 * that made several requests had already chosen an order, and `update` now
 * takes the whole document and replaces with it. So the read, the patch and the
 * write are the consumer's, and this is the patch half — ported from the
 * implementation at the `18.0.2` tag rather than reinvented.
 *
 * **Why patch the text and not rebuild it.** The document carries fields nobody
 * here knows about — `abapLanguageVersion`, links, SAP-managed state — and
 * building one from the fields a caller named would drop every one of them.
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

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Apply a replacement, refusing to pass the XML through untouched.
 *
 * A caller reaches a patch only when it intends the change — `patchIf` skips
 * the call for an absent value — so "no match" always means the PUT would not
 * carry what the caller asked for. There is no case where quietly returning the
 * input is right.
 */
function replaceOrThrow(
  xml: string,
  regex: RegExp,
  replacement: string,
  target: string,
): string {
  if (!regex.test(xml)) {
    throw new XmlPatchError(
      `Cannot patch ${target}: it is not present in the XML being updated. ${NOT_PRESENT}`,
    );
  }
  return xml.replace(regex, replacement);
}

/** `adtcore:description="old"` becomes `adtcore:description="new"`. */
export function patchXmlAttribute(
  xml: string,
  attrName: string,
  newValue: string,
): string {
  return replaceOrThrow(
    xml,
    new RegExp(`${attrName}="[^"]*"`),
    `${attrName}="${escapeXmlAttr(newValue)}"`,
    `attribute ${attrName}`,
  );
}

/** Element text. Handles `<tag>x</tag>` and the self-closing `<tag/>`. */
export function patchXmlElement(
  xml: string,
  tagName: string,
  newValue: string,
): string {
  const regex = new RegExp(
    `<${tagName}>([^<]*)</${tagName}>|<${tagName}\\s*/>`,
  );
  const replacement =
    newValue === '' || newValue === undefined
      ? `<${tagName}/>`
      : `<${tagName}>${escapeXmlText(newValue)}</${tagName}>`;
  return replaceOrThrow(xml, regex, replacement, `element <${tagName}>`);
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
  const value = escapeXmlAttr(newValue);
  const withAttribute = new RegExp(`(<${elementTag}[^>]*?)${attrName}="[^"]*"`);
  if (withAttribute.test(xml)) {
    return xml.replace(withAttribute, `$1${attrName}="${value}"`);
  }
  const element = new RegExp(`<${elementTag}(\\s[^>]*?)?(/?)>`);
  if (element.test(xml)) {
    return xml.replace(
      element,
      (_match, attrs, selfClosing) =>
        `<${elementTag}${attrs ?? ''} ${attrName}="${value}"${selfClosing}>`,
    );
  }
  throw new XmlPatchError(
    `Cannot patch attribute ${attrName}: element <${elementTag}> is not present in the XML being updated. ${NOT_PRESENT}`,
  );
}

/** A whole block, opening tag to closing tag, nesting and all. */
export function patchXmlBlock(
  xml: string,
  tagName: string,
  newContent: string,
): string {
  return replaceOrThrow(
    xml,
    new RegExp(`<${tagName}[\\s\\S]*?</${tagName}>|<${tagName}\\s*/>`),
    newContent,
    `block <${tagName}>`,
  );
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
