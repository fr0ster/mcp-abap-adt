import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces';
import { XMLParser } from 'fast-xml-parser';

/**
 * What a result strategy of ours answers.
 *
 * **Both halves, because the strategy cannot know which one is wanted.** A
 * result strategy is injected once, when the client is constructed; `detail` is
 * a parameter of the call. So a strategy that returned only the parse could
 * never serve `detail: 'raw'`, and one that returned only the document would
 * make every projection parse it again.
 *
 * `raw` is `answer.data` unmodified — no parse, no reserialisation, no
 * reformatting. Where the transport has already turned the body into an object
 * there is no text to keep, and `raw` is a faithful serialisation of that
 * object instead. That is the honest version of the guarantee: character for
 * character, not byte for byte.
 */
export interface AdtReading<T> {
  /** The parse. `terse` and `full` project from this. */
  readonly value: T;
  /** The body as it arrived. `raw` answers this. */
  readonly raw: string;
  /** The status, because for some members it is the whole verdict. */
  readonly status: number;
}

/**
 * The one parser every structured reading uses.
 *
 * Two rules, and they come from how the transport-tree parser broke in #168.
 *
 * **The structure is named, the attributes are verbatim.** Keys stay as SAP
 * sent them — `adtcore:name`, `chkrun:status`, `del:isDeleted` — so a field SAP
 * adds is a field the caller can see. A selective parse that picked known
 * fields would discard it silently.
 *
 * **A level that can repeat is always an array.** SAP sends a bare object when
 * there is one child and an array when there are two, and code written against
 * the two-child case throws on the one-child one. `isArray` is answered from
 * the element name, not from what happened to arrive.
 *
 * Numeric coercion is off on both axes: `T100KEY-NO` is `"026"`, and `026`
 * parsed as a number is `26`, a message key no SAP system knows.
 */
const REPEATABLE = new Set([
  'msg',
  'entry',
  'checkReport',
  'checkMessage',
  'alert',
  'detail',
  'stackEntry',
  'objectReference',
  'object',
  'testClass',
  'testMethod',
  'program',
  'link',
  'request',
  'task',
  'node',
  'SEU_ADT_OBJECT_TYPE_INFO',
  'SEU_ADT_OBJECT_CATEGORY_INFO',
  'SEU_ADT_REPOSITORY_OBJ_NODE',
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  attributesGroupName: '@',
  parseAttributeValue: false,
  parseTagValue: false,
  removeNSPrefix: false,
  isArray: (name) => REPEATABLE.has(name.replace(/^\w+:/, '')),
});

/** Parse a document into named structure with verbatim attributes. */
export function parseStructure(document: unknown): unknown {
  if (typeof document !== 'string' || document.trim() === '') return null;
  try {
    return parser.parse(document);
  } catch {
    return null;
  }
}

/** `answer.data` as text, without pretending an object was ever a string. */
export function rawOf(answer: IAdtWireResponse): string {
  const body = (answer as { data?: unknown }).data;
  if (typeof body === 'string') return body;
  if (body === undefined || body === null) return '';
  if (typeof body === 'object') {
    try {
      return JSON.stringify(body);
    } catch {
      return String(body);
    }
  }
  return String(body);
}

/** Wrap a parse as a result strategy that keeps the document beside it. */
export function reading<T>(
  parse: (answer: IAdtWireResponse) => T,
): (answer: IAdtWireResponse) => AdtReading<T> {
  return (answer) => ({
    value: parse(answer),
    raw: rawOf(answer),
    status: Number((answer as { status?: unknown }).status ?? 0),
  });
}

/** The structured reading: parse the body, keep it beside the parse. */
export const structured = reading((answer) => parseStructure(rawOf(answer)));

/**
 * The document, handed through unchanged.
 *
 * **This is the right reading for more members than it looks.** Source is
 * obvious: the text is the answer and parsing it would be a lie. Metadata is
 * the one worth saying out loud — it is XML, and the tools return JSON, but
 * they carry the XML through as a string inside that JSON. `handleReadClass`
 * puts `metadataResult.data` in a `metadata` field verbatim and has never
 * parsed it.
 *
 * So the eight media types and seven root elements the corpus found in metadata
 * need no reading at all under the current tool interface. They would only
 * start to matter the day a tool promised named fields out of them, and that
 * day is a change to the tool surface, not to a strategy.
 */
export const verbatim = reading((answer) => rawOf(answer));

/** @deprecated Use {@link verbatim}. Kept so the name reads at the call site. */
export const sourceText = verbatim;

/**
 * For a member whose answer is the status and nothing else — a class create
 * answers 200 with zero bytes, a successful write answers 200 with zero bytes.
 */
export const statusOnly = reading(() => undefined);
