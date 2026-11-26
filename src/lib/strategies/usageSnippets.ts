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
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { XMLParser } from 'fast-xml-parser';
import {
  type AdtHeadersContext,
  withAdtHeaders,
} from '../adtHeaders/withAdtHeaders';
import { requestErrorOf, requestFailureOf } from '../answer';
import { wireValueOf } from '../wireValue';
import { parseXml } from '../xml/node';
import { attr, child, listOf, text, walk } from '../xml/tree';
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

/** The reader: SAP's text kept as it came, the prefixes gone. */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  removeNSPrefix: true,
});

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

/** The request body: every identifier, in the order given. */
export function usageSnippetsRequest(identifiers: readonly string[]): string {
  const listed = identifiers
    .map(
      (identifier) =>
        `<usagereferences:objectIdentifier optional="false">${escaped(identifier)}</usagereferences:objectIdentifier>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><usagereferences:usageSnippetRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences"><usagereferences:objectIdentifiers>${listed}</usagereferences:objectIdentifiers><usagereferences:affectedObjects/></usagereferences:usageSnippetRequest>`;
}

/**
 * The code lines of a `usageSnippets` answer, by identifier: every
 * `codeSnippetObject` at any depth, each `codeSnippet` of it with its `uri`
 * and `content`, `matches` where SAP sent it. An object without an
 * identifier, or a snippet without a `uri` or a `content`, is not read.
 */
export function usageSnippetsReading(document: string): UsageSnippets {
  const read = new Map<string, WhereUsedSnippet[]>();
  for (const visit of walk(parseXml(parser, document))) {
    if (visit.name !== 'codeSnippetObject') continue;
    const identifier = text(child(visit.node, 'objectIdentifier'));
    if (identifier === undefined) continue;
    const snippets = read.get(identifier) ?? [];
    for (const snippet of listOf(
      child(child(visit.node, 'codeSnippets'), 'codeSnippet'),
    )) {
      const uri = attr(snippet, '@_uri');
      const content = text(child(snippet, 'content'));
      if (uri === undefined || content === undefined) continue;
      const matches = attr(snippet, '@_matches');
      snippets.push(
        matches === undefined ? { uri, content } : { uri, content, matches },
      );
    }
    read.set(identifier, snippets);
  }
  return read;
}

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
  return {
    read: (identifiers) =>
      withAdtHeaders(context, 'utils.getUsageSnippets', async (headers) => {
        try {
          const answered = await connection.makeAdtRequest({
            url: USAGE_SNIPPETS_URL,
            method: 'POST',
            timeout: 0,
            data: usageSnippetsRequest(identifiers),
            headers: {
              Accept: headers.accept,
              'Content-Type': headers.contentType,
            },
          });
          // A connection that hands back a status other than a 2xx instead
          // of throwing it (an embedder's own) is refused by it all the same.
          if (answered.status < 200 || answered.status > 299) {
            const refused: IAdtResponse<UsageSnippets, IAdtError> = failed(
              requestErrorOf(
                {
                  message: `Request failed with status code ${answered.status}`,
                  response: answered,
                },
                { method: 'POST', url: USAGE_SNIPPETS_URL },
              ),
            );
            return refused;
          }
          const body = wireValueOf(answered.data);
          return succeeded(
            usageSnippetsReading(body.kind === 'text' ? body.text : ''),
          );
        } catch (thrown) {
          const error = requestFailureOf(thrown, {
            method: 'POST',
            url: USAGE_SNIPPETS_URL,
          });
          if (error === undefined) throw thrown;
          const failure: IAdtResponse<UsageSnippets, IAdtError> = failed(error);
          return failure;
        }
      }),
  };
}
