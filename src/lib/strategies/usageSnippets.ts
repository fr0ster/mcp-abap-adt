/**
 * The code lines of where-used usages: `POST
 * /sap/bc/adt/repository/informationsystem/usageSnippets`, in discovery on
 * premise and on the cloud (handler `CL_RIS_ADT_RES_REF_SNIPPETS`, its
 * content types enforced by `cl_adt_rest_comp_cnt_handler`; measured
 * 2026-11-26).
 *
 * The request lists the `objectIdentifier` of every usage the
 * `usageReferences` answer returned — one request takes any number of
 * them —; the answer holds one `codeSnippetObject` per identifier, one
 * `codeSnippet` per source line holding a usage:
 *
 * ```
 * <usageReferences:codeSnippetObject>
 *   <objectIdentifier>ABAPFullName;ZCL_OK_TEST===…CP;ZCL_OK_TEST===…CM001;\TY:ZMCP_SHR_DTEL</objectIdentifier>
 *   <usageReferences:codeSnippets>
 *     <usageReferences:codeSnippet uri="/sap/bc/adt/oo/classes/zcl_ok_test/source/main#type=CLAS%2FOM;name=TESTER;start=2,10;end=2,17" matches="10-17,…">
 *       <content>    DATA: lv_test TYPE ZMCP_SHR_DTEL.</content>
 * ```
 *
 * No adt-clients member sends it and adt-strategies 0.28.3 reads no
 * `usageSnippetResult`: the request is made here, and the answer read
 * here, until adt-strategies reads it.
 */

import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import type {
  IAbapConnection,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import {
  type AdtHeadersContext,
  withAdtHeaders,
} from '../adtHeaders/withAdtHeaders';
import { requestErrorOf, requestFailureOf } from '../answer';
import { wireValueOf } from '../wireValue';
import {
  isWellFormed,
  ORDERED_ATTRIBUTES,
  ORDERED_CDATA,
  ORDERED_TEXT,
  orderedText,
  parseOrdered,
} from '../xml/ordered';
import {
  attr,
  child,
  entries,
  listOf,
  localName,
  text,
  type XmlList,
  type XmlRead,
} from '../xml/tree';
import { failed, succeeded } from './stepResponse';

/** Where the code lines are read. */
export const USAGE_SNIPPETS_URL =
  '/sap/bc/adt/repository/informationsystem/usageSnippets';

/** One source line holding a usage, as SAP sent it. */
export type WhereUsedSnippet = {
  /**
   * The usage's ADT position (`…#type=CLAS%2FOM;name=TESTER;start=2,10;end=2,17`):
   * the element in `name=` where SAP names one, the line and columns.
   */
  readonly uri: string;
  /** The source line, as SAP sent it. */
  readonly content: string;
  /** Every usage on the line (`colFrom-colTo,access,grade;…`), where SAP sends it. */
  readonly matches?: string;
};

/** The code lines read, by the `objectIdentifier` they were asked for. */
export type UsageSnippets = ReadonlyMap<string, readonly WhereUsedSnippet[]>;

/** Reads the code lines of the usages named by their identifiers. */
export interface UsageSnippetsSource {
  read(
    identifiers: readonly string[],
  ): Promise<IAdtResponse<UsageSnippets, IAdtError>>;
}

/** The named references XML defines, by name. */
const NAMED_REFERENCES: ReadonlyMap<string, string> = new Map([
  ['lt', '<'],
  ['gt', '>'],
  ['amp', '&'],
  ['quot', '"'],
  ['apos', "'"],
]);

/** A character reference's code (`#38`, `#x26`) as its character, else `undefined`. */
function characterOf(reference: string): string | undefined {
  const hex = reference.startsWith('#x') || reference.startsWith('#X');
  const digits = reference.slice(hex ? 2 : 1);
  if (digits === '') return undefined;
  const allowed = hex ? '0123456789abcdefABCDEF' : '0123456789';
  for (const digit of digits) if (!allowed.includes(digit)) return undefined;
  const code = Number.parseInt(digits, hex ? 16 : 10);
  if (!Number.isSafeInteger(code) || code > 0x10ffff) return undefined;
  return String.fromCodePoint(code);
}

/**
 * `value` with its references decoded in one pass, as an XML parser decodes
 * them — the five named ones and every character reference, decimal or
 * hexadecimal (`&#38;`, `&#x26;`) —, as adt-strategies' readers decode the
 * where-used answer (`XML_TEXT_OPTIONS`), so an identifier reads the same
 * in both answers. A reference not so defined stays as written. Plain code:
 * no regular expression over SAP's text.
 */
export function decodeXmlReferences(value: string): string {
  let decoded = '';
  let at = 0;
  while (at < value.length) {
    const amp = value.indexOf('&', at);
    if (amp < 0) break;
    const semi = value.indexOf(';', amp + 1);
    if (semi < 0) break;
    const reference = value.slice(amp + 1, semi);
    const character = reference.startsWith('#')
      ? characterOf(reference)
      : NAMED_REFERENCES.get(reference);
    decoded += value.slice(at, amp);
    if (character === undefined) {
      decoded += '&';
      at = amp + 1;
    } else {
      decoded += character;
      at = semi + 1;
    }
  }
  return decoded + value.slice(at);
}

/** `value` escaped for an XML text node. */
function escaped(value: string): string {
  return value
    .split('&')
    .join('&amp;')
    .split('<')
    .join('&lt;')
    .split('>')
    .join('&gt;');
}

/**
 * The request body, as Eclipse sends it (its trace, 2026-11-26): every
 * identifier, `optional="false"`, then `affectedObjects`, then the grade
 * with `definitions`, `elements` and `indirectReferences` all true — direct
 * and indirect usages, as the owner's example names them ("1 direct usage,
 * 1 indirect usage"). Sent for one using object's usages only (`in_object`),
 * as Eclipse sends it for the node opened: one identifier took SAP 0.17 s.
 */
export function usageSnippetsRequest(identifiers: readonly string[]): string {
  const listed = identifiers
    .map(
      (identifier) =>
        `<usagereferences:objectIdentifier optional="false">${escaped(identifier)}</usagereferences:objectIdentifier>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><usagereferences:usageSnippetRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:objectIdentifiers>${listed}</usagereferences:objectIdentifiers><usagereferences:affectedObjects/><usagereferences:grade definitions="true" elements="true" indirectReferences="true"/></usagereferences:usageSnippetRequest>`;
}

/** An element of the ordered form: its local name, its attributes, its content. */
interface Ordered {
  readonly name: string;
  readonly attributes: XmlRead;
  readonly content: XmlList;
}

/** The elements among `members`, in document order: no text, CDATA, comment or declaration. */
function orderedChildren(members: XmlList): Ordered[] {
  const found: Ordered[] = [];
  for (const member of members) {
    for (const [name, content] of entries(member)) {
      if (
        name === ORDERED_ATTRIBUTES ||
        name.startsWith('#') ||
        name.startsWith('?')
      ) {
        continue;
      }
      found.push({
        name: localName(name),
        attributes: child(member, ORDERED_ATTRIBUTES),
        content: listOf(content),
      });
    }
  }
  return found;
}

/** The children of `parent` named `name` (its local name). */
function named(parent: XmlList, name: string): Ordered[] {
  return orderedChildren(parent).filter((element) => element.name === name);
}

/**
 * An element's text in document order: each text member with its
 * references decoded ({@link decodeXmlReferences}), each CDATA section as
 * written — `A<![CDATA[B]]>C` is `ABC`. `undefined` when it holds an
 * element: no text of ours.
 */
function textInOrder(content: XmlList): string | undefined {
  let read = '';
  for (const member of content) {
    for (const [name, value] of entries(member)) {
      if (name === ORDERED_TEXT) {
        read += decodeXmlReferences(text(value) ?? '');
      } else if (name === ORDERED_CDATA) {
        read += orderedText(listOf(value));
      } else if (!name.startsWith('#')) {
        return undefined;
      }
    }
  }
  return read;
}

/** The attribute `name` of an element, its references decoded. */
function attribute(element: Ordered, name: string): string | undefined {
  const value = attr(element.attributes, name);
  return value === undefined ? undefined : decodeXmlReferences(value);
}

/**
 * The code lines of a `usageSnippets` answer, by identifier: the document's
 * root must be `usageSnippetResult` and hold its `codeSnippetObjects`; each
 * `codeSnippetObject` there — and only there — is read with its
 * `objectIdentifier` and each `codeSnippet` of its `codeSnippets`, its
 * `uri`, its `content` in document order and `matches` where SAP sent it.
 * An object present with no snippet is an identifier with no line; an
 * identifier the answer leaves out is absent from the map (the caller
 * tells the two apart). `undefined` for any other document — not
 * well-formed, another root, no collection, an object without its
 * identifier, a snippet without its `uri` or `content` —: a reading that
 * cannot be told from SAP giving no code lines is not answered as one.
 */
export function usageSnippetsReading(
  document: string,
): UsageSnippets | undefined {
  if (!isWellFormed(document)) return undefined;
  const parsed = parseOrdered(document);
  if (parsed === null) return undefined;
  const [root, ...others] = orderedChildren(listOf(parsed));
  if (root === undefined || others.length > 0) return undefined;
  if (root.name !== 'usageSnippetResult') return undefined;
  const collections = named(root.content, 'codeSnippetObjects');
  const [collection] = collections;
  if (collection === undefined || collections.length > 1) return undefined;
  const read = new Map<string, WhereUsedSnippet[]>();
  for (const object of named(collection.content, 'codeSnippetObject')) {
    const [identifierElement] = named(object.content, 'objectIdentifier');
    const identifier =
      identifierElement === undefined
        ? undefined
        : textInOrder(identifierElement.content);
    if (identifier === undefined || identifier === '') return undefined;
    const snippets = read.get(identifier) ?? [];
    for (const list of named(object.content, 'codeSnippets')) {
      for (const snippet of named(list.content, 'codeSnippet')) {
        const uri = attribute(snippet, 'uri');
        const [contentElement] = named(snippet.content, 'content');
        const content =
          contentElement === undefined
            ? undefined
            : textInOrder(contentElement.content);
        if (uri === undefined || content === undefined) return undefined;
        const matches = attribute(snippet, 'matches');
        snippets.push(
          matches === undefined ? { uri, content } : { uri, content, matches },
        );
      }
    }
    read.set(identifier, snippets);
  }
  return read;
}

/** The words of an answer {@link usageSnippetsReading} cannot read. */
export const UNREADABLE_SNIPPETS =
  'the usageSnippets answer is no usage snippet result: no code line could be read';

/**
 * The element a snippet's position names: the `name=` part of its URI's
 * fragment, decoded (`…#type=CLAS%2FOM;name=TESTER;start=2,10` → `TESTER`);
 * `undefined` where SAP names none (a program's line, a section's).
 */
export function snippetElement(uri: string): string | undefined {
  const hash = uri.indexOf('#');
  if (hash < 0) return undefined;
  for (const part of uri.slice(hash + 1).split(';')) {
    if (!part.startsWith('name=')) continue;
    const name = part.slice('name='.length);
    if (name === '') return undefined;
    try {
      return decodeURIComponent(name);
    } catch {
      return name;
    }
  }
  return undefined;
}

/**
 * `connection` as a {@link UsageSnippetsSource}: one POST, with the header
 * pair of the call's system (`withAdtHeaders`), no timeout. A request SAP
 * refused is the read's failure, as SAP answered it; a chain failure is
 * thrown, as every read throws it.
 */
export function usageSnippetsOn(
  context: AdtHeadersContext,
  connection: IAbapConnection,
): UsageSnippetsSource {
  const sent = { method: 'POST', url: USAGE_SNIPPETS_URL };
  return {
    read: (identifiers) =>
      withAdtHeaders(context, 'utils.getUsageSnippets', async (headers) => {
        let answered: IAdtWireResponse;
        try {
          answered = await connection.makeAdtRequest({
            url: USAGE_SNIPPETS_URL,
            method: 'POST',
            timeout: 0,
            data: usageSnippetsRequest(identifiers),
            headers: {
              Accept: headers.accept,
              'Content-Type': headers.contentType,
            },
          });
        } catch (thrown) {
          const error = requestFailureOf(thrown, sent);
          if (error === undefined) throw thrown;
          const failure: IAdtResponse<UsageSnippets, IAdtError> = failed(error);
          return failure;
        }
        // A connection that hands back a status other than a 2xx instead of
        // throwing it (an embedder's own) is refused by it all the same.
        if (answered.status < 200 || answered.status > 299) {
          const refused: IAdtResponse<UsageSnippets, IAdtError> = failed(
            requestErrorOf(
              {
                message: `Request failed with status code ${answered.status}`,
                response: answered,
              },
              sent,
            ),
          );
          return refused;
        }
        const body = wireValueOf(answered.data);
        const read =
          body.kind === 'text' ? usageSnippetsReading(body.text) : undefined;
        // Thrown, so the step names it (`atStep`): never read as no lines.
        if (read === undefined) throw new Error(UNREADABLE_SNIPPETS);
        return succeeded(read);
      }),
  };
}
