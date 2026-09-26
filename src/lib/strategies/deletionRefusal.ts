/**
 * This consumer's reading of a deletion answer: `del:checkResponse` (the
 * deletion check) and `del:deletionResult` (the delete).
 *
 * **Why not the default from `@mcp-abap-adt/adt-strategies`.** Its
 * `readDeletionRefusal` (0.4.0) reads `object.message` as one element. SAP
 * sends several: on E19 (2026-09-26) the check of a service binding that did
 * not exist answered
 *
 *   <del:message del:type="W"><del:text>ZMCP_BLD_SRVB01 does not exist</del:text></del:message>
 *   <del:message del:type="E"><del:text>The Service Binding does not exist</del:text>…</del:message>
 *
 * The parser turns two siblings into an array, the default read `text` and
 * `@type` off the array, found neither, and answered the refusal with its
 * fallback — "0 strong and 0 weak external references" — instead of what
 * SAP said. Its verdict was right (`isDeletable="false"`); only the reason was
 * lost, and a `del:type="E"` second message on a permitted object would be
 * missed entirely.
 * Reported upstream: https://github.com/fr0ster/mcp-abap-adt-clients/issues/172
 *
 * **The rules**, per `del:object`:
 * - refused when the verdict attribute (`isDeletable` on a check, `isDeleted`
 *   on a delete) is anything but an explicit "true", or any message is `E`;
 * - every message of a refused object is kept, each with its own severity,
 *   in the order SAP sent them, and the T100 key when its long-text link
 *   carries one (`/messageclass/SWB_TOOL/messages/029/longtext?…&msgv1=…`);
 * - with no message text at all, the reference counts stand in, then
 *   "the server did not say why".
 *
 * A failure the transport already reported (a non-2xx) is left to the
 * default, which reads the `exc:exception` body.
 */
import { analyseDeletion as defaultAnalyseDeletion } from '@mcp-abap-adt/adt-strategies';
import {
  ADT_NO_FAILURE,
  type AdtNoFailure,
  type IAdtError,
  type IAnalyse,
} from '@mcp-abap-adt/interfaces-adt';
import { XMLParser } from 'fast-xml-parser';

export interface DeletionMessage {
  type: string;
  text: string;
  t100?: { id: string; no: string; values?: string[] };
}

export interface DeletionRefusal {
  message: string;
  messages: DeletionMessage[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseAttributeValue: false,
  parseTagValue: false,
  removeNSPrefix: true,
});

const asArray = <T>(value: T | T[] | undefined | null): T[] =>
  value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value
      : [value];

function textOf(node: unknown): string {
  if (typeof node === 'string') return node.trim();
  if (typeof node === 'number') return String(node);
  if (node && typeof node === 'object') {
    const text = (node as Record<string, unknown>)['#text'];
    if (typeof text === 'string') return text.trim();
  }
  return '';
}

/** SAP's letters; the abort kinds count as errors. */
function severity(raw: unknown): string {
  const letter = String(raw ?? '')
    .trim()
    .toUpperCase()
    .charAt(0);
  if (letter === 'A' || letter === 'X') return 'E';
  return letter || 'E';
}

/** The T100 key out of the message's long-text link, when it has one. */
function t100Of(message: Record<string, unknown>): DeletionMessage['t100'] {
  for (const link of asArray(message.link as any)) {
    const href = String((link as Record<string, unknown>)?.['@href'] ?? '');
    const key = /\/messageclass\/([^/]+)\/messages\/([^/?]+)/.exec(href);
    if (!key) continue;
    const query = new URLSearchParams(href.split('?')[1] ?? '');
    const values = ['msgv1', 'msgv2', 'msgv3', 'msgv4']
      .map((name) => query.get(name))
      .filter((value): value is string => value !== null);
    return {
      id: decodeURIComponent(key[1]),
      no: decodeURIComponent(key[2]),
      ...(values.length ? { values } : {}),
    };
  }
  return undefined;
}

/** A refusal read out of a deletion document, or null when there is none. */
export function readDeletionRefusal(document: unknown): DeletionRefusal | null {
  if (typeof document !== 'string' || document.trim() === '') return null;
  let parsed: Record<string, any>;
  try {
    parsed = parser.parse(document);
  } catch {
    return null;
  }
  const isCheck = Boolean(parsed?.checkResponse);
  const root = parsed?.checkResponse ?? parsed?.deletionResult;
  const objects = asArray<Record<string, any>>(root?.object);
  if (objects.length === 0) return null;

  const verdictAttribute = isCheck ? '@isDeletable' : '@isDeleted';
  const names: string[] = [];
  const messages: DeletionMessage[] = [];
  for (const object of objects) {
    const said = asArray<Record<string, any>>(object?.message)
      .map((message) => ({
        type: severity(message?.['@type']),
        text: textOf(message?.text),
        t100: t100Of(message),
      }))
      .filter((message) => message.text !== '');
    const permitted = object?.[verdictAttribute] === 'true';
    if (permitted && !said.some((message) => message.type === 'E')) continue;

    const name =
      typeof object?.['@name'] === 'string'
        ? object['@name']
        : '(unnamed object)';
    names.push(name);
    if (said.length > 0) {
      for (const message of said) {
        messages.push({
          type: message.type,
          text: `${name}: ${message.text}`,
          ...(message.t100 ? { t100: message.t100 } : {}),
        });
      }
      continue;
    }
    const references =
      isCheck &&
      (object?.['@externalStrongReferences'] ||
        object?.['@externalWeakReferences'])
        ? `${object['@externalStrongReferences'] ?? 0} strong and ${object['@externalWeakReferences'] ?? 0} weak external references`
        : undefined;
    messages.push({
      type: 'E',
      text: `${name}: ${references ?? 'the server did not say why'}`,
    });
  }
  if (names.length === 0) return null;
  return {
    message: `ADT refuses to delete ${names.join(', ')}`,
    messages,
  };
}

export const analyseDeletion: IAnalyse<IAdtError> = (verdict, answer) => {
  if (verdict !== ADT_NO_FAILURE) {
    return defaultAnalyseDeletion(verdict, answer) as IAdtError | AdtNoFailure;
  }
  const refusal = readDeletionRefusal(answer?.data);
  if (!refusal) return ADT_NO_FAILURE;
  const request = requestOf(answer);
  return {
    origin: 'refusal',
    message: refusal.message,
    messages: refusal.messages,
    response: answer,
    ...(request ? { request } : {}),
  } as unknown as IAdtError;
};

/** Method and url, copied by name: adt-clients' `request` first, axios's
 * `config` as the fallback — the same order the default reads them in. */
function requestOf(
  answer: unknown,
): { method?: string; url?: string } | undefined {
  const holder = answer as
    | { request?: Record<string, unknown>; config?: Record<string, unknown> }
    | undefined;
  for (const source of [holder?.request, holder?.config]) {
    const method =
      typeof source?.method === 'string' ? source.method : undefined;
    const url = typeof source?.url === 'string' ? source.url : undefined;
    if (method || url) return { method, url };
  }
  return undefined;
}
