/**
 * A live test's own change to a metadata document: the root element's
 * `adtcore:description`, set when present, added when not.
 *
 * Plain string code over the document SAP answered: the root is the first
 * element after the declaration, comments and processing instructions; its
 * start tag is read attribute by attribute, so a description on any other
 * element (a package reference's, a message's) is never touched. The value
 * is escaped for a double-quoted attribute. A document without a root
 * element throws: the test's read answered nothing to change.
 */

/** `value` escaped for a double-quoted attribute. */
function escapeAttribute(value: string): string {
  let out = '';
  for (const character of value) {
    if (character === '&') out += '&amp;';
    else if (character === '<') out += '&lt;';
    else if (character === '>') out += '&gt;';
    else if (character === '"') out += '&quot;';
    else out += character;
  }
  return out;
}

const isBlank = (character: string | undefined): boolean =>
  character === ' ' ||
  character === '\t' ||
  character === '\n' ||
  character === '\r';

/** Where the root element's start tag begins: its `<`. */
function rootStart(document: string): number {
  const skips: ReadonlyArray<readonly [string, string]> = [
    ['<?', '?>'],
    ['<!--', '-->'],
    ['<!', '>'],
  ];
  let at = 0;
  for (;;) {
    const open = document.indexOf('<', at);
    if (open < 0) break;
    const skip = skips.find(([start]) => document.startsWith(start, open));
    if (skip === undefined) return open;
    const close = document.indexOf(skip[1], open + skip[0].length);
    if (close < 0) break;
    at = close + skip[1].length;
  }
  throw new Error('The document has no root element to describe.');
}

/** The document with its root element's `adtcore:description` set to `value`. */
export function withRootDescription(document: string, value: string): string {
  const name = 'adtcore:description';
  const escaped = escapeAttribute(value);
  let at = rootStart(document) + 1;
  // The element's name.
  while (
    at < document.length &&
    !isBlank(document[at]) &&
    document[at] !== '>' &&
    document[at] !== '/'
  ) {
    at += 1;
  }
  // Its attributes, one by one, to the start tag's close.
  for (;;) {
    while (isBlank(document[at])) at += 1;
    if (at >= document.length) {
      throw new Error('The root element of the document is not closed.');
    }
    if (document[at] === '>' || document.startsWith('/>', at)) {
      return `${document.slice(0, at)} ${name}="${escaped}"${document.slice(at)}`;
    }
    const nameStart = at;
    while (
      at < document.length &&
      document[at] !== '=' &&
      !isBlank(document[at])
    ) {
      at += 1;
    }
    const attribute = document.slice(nameStart, at);
    while (isBlank(document[at])) at += 1;
    at += 1; // '='
    while (isBlank(document[at])) at += 1;
    const quote = document[at];
    const valueStart = at + 1;
    const valueEnd =
      quote === undefined ? -1 : document.indexOf(quote, valueStart);
    if (valueEnd < 0) {
      throw new Error('An attribute of the root element is not closed.');
    }
    if (attribute === name) {
      return `${document.slice(0, valueStart)}${quote === '"' ? escaped : escaped.split("'").join('&apos;')}${document.slice(valueEnd)}`;
    }
    at = valueEnd + 1;
  }
}
