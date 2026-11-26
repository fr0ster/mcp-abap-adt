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
import { XMLParser } from 'fast-xml-parser';
import {
  type AdtHeadersContext,
  withAdtHeaders,
} from '../adtHeaders/withAdtHeaders';
import { requestErrorOf, requestFailureOf } from '../answer';
import { wireValueOf } from '../wireValue';
import { parseXml } from '../xml/node';
import { isWellFormed } from '../xml/ordered';
import {
  attr,
  child,
  isElement,
  listOf,
  text,
  walk,
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

/**
 * The reader: the prefixes gone, values as text, each reference decoded
 * once by {@link decodeXmlReferences} (the parser's own entity handling
 * leaves character references as written), a CDATA section kept apart, as
 * written.
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  removeNSPrefix: true,
  processEntities: false,
  cdataPropName: '#cdata',
  tagValueProcessor: (_name: string, value: string) =>
    decodeXmlReferences(value),
  attributeValueProcessor: (_name: string, value: string) =>
    decodeXmlReferences(value),
});

/** An element's own text: its text, then its CDATA sections as written. */
function ownText(value: XmlRead): string | undefined {
  if (typeof value === 'string') return value;
  if (!isElement(value)) return undefined;
  const written = text(value);
  const sections = listOf(child(value, '#cdata')).flatMap((section) => {
    const read = text(section);
    return read === undefined ? [] : [read];
  });
  if (written === undefined && sections.length === 0) {
    // An empty element: its text is empty.
    return Object.keys(value).every((key) => key.startsWith('@_'))
      ? ''
      : undefined;
  }
  return (written ?? '') + sections.join('');
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

/**
 * The code lines of a `usageSnippets` answer, by identifier: every
 * `codeSnippetObject` at any depth, each `codeSnippet` of it with its `uri`
 * and `content`, `matches` where SAP sent it. `undefined` for a document
 * that is no such answer — not well-formed, without any
 * `codeSnippetObject`, an object without its identifier, a snippet without
 * its `uri` or its `content` —: a reading that cannot be told from SAP
 * giving no code lines is not answered as one.
 */
export function usageSnippetsReading(
  document: string,
): UsageSnippets | undefined {
  if (!isWellFormed(document)) return undefined;
  const read = new Map<string, WhereUsedSnippet[]>();
  let objects = 0;
  for (const visit of walk(parseXml(parser, document))) {
    if (visit.name !== 'codeSnippetObject') continue;
    objects += 1;
    const identifier = ownText(child(visit.node, 'objectIdentifier'));
    if (identifier === undefined || identifier === '') return undefined;
    const snippets = read.get(identifier) ?? [];
    for (const snippet of listOf(
      child(child(visit.node, 'codeSnippets'), 'codeSnippet'),
    )) {
      const uri = attr(snippet, '@_uri');
      const content = ownText(child(snippet, 'content'));
      if (uri === undefined || content === undefined) return undefined;
      const matches = attr(snippet, '@_matches');
      snippets.push(
        matches === undefined ? { uri, content } : { uri, content, matches },
      );
    }
    read.set(identifier, snippets);
  }
  return objects === 0 ? undefined : read;
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
