import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { XMLParser } from 'fast-xml-parser';
import { withoutNamePrefix } from '../plainText';
import { parseXml, type XmlNode } from '../xml/node';
import { attr, child, type Visit, walk, type XmlRead } from '../xml/tree';

/**
 * What a result strategy of ours answers.
 *
 * **A result strategy is keyed on the transformation, not on the operation and
 * not on the object type.** There are three: hand the body through, parse it
 * into named structure, or there is no body at all. Which member produced the
 * answer does not change that, and neither does whether it was a class or a
 * domain. What varies per member is the projection, and mostly not even that.
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
 *
 * Entities are decoded: the five XML ones and character references
 * (`&#39;`, `&#x26;`) — the parser's `htmlEntities`, which also knows the
 * common HTML names, a spelling no well-formed SAP document uses.
 *
 * **Names are matched by prefix, not by namespace URI.** Every reader here
 * looks an element or an attribute up by the name the document spells
 * (`adtcore:name`, `atom:link`), or by its local name; none resolves a prefix
 * to its `xmlns` URI. SAP spells each document type with fixed prefixes, so
 * this reads SAP's answers; a document that bound another prefix to the same
 * URI would not be read.
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
  htmlEntities: true,
  isArray: (name) => REPEATABLE.has(withoutNamePrefix(name)),
});

/**
 * Parse a document into named structure with verbatim attributes; `null` for
 * a blank document or one that does not parse. The parse is typed at the
 * parse (`xml/node`).
 */
export function parseStructure(document: string): XmlNode | null {
  if (document.trim() === '') return null;
  try {
    return parseXml(parser, document) ?? null;
  } catch {
    return null;
  }
}

/** The attribute `name` of an element {@link parseStructure} answered (its attributes sit under `@`). */
export function attributeOf(node: XmlRead, name: string): string | undefined {
  return attr(child(node, '@'), name);
}

/**
 * Every element and text member of a document {@link parseStructure} answered,
 * at any depth ({@link walk}); attributes are not members.
 *
 * **The order is the grouped parse's, not the document's.** An element comes
 * before what it holds and siblings of one name come in their order, but
 * siblings of different names are grouped by name, in the order each name
 * first appears: in `<r><x/><p/><x/></r>` both `x` come before `p`. Where
 * document order matters, read the ordered form (`xml/ordered`).
 */
export function walkStructure(document: XmlRead): Visit[] {
  return walk(document, ATTRIBUTES).filter(
    (visit) => !ATTRIBUTES.has(visit.name),
  );
}

const ATTRIBUTES: ReadonlySet<string> = new Set(['@']);

/** The members named `name` (as the document spells it), at any depth, in {@link walkStructure}'s order. */
export function membersNamed(document: XmlRead, name: string): Visit[] {
  return walkStructure(document).filter((visit) => visit.name === name);
}

/**
 * The value of attribute `name` on the first element that carries it, in
 * {@link walkStructure}'s order — an element before the ones it holds.
 */
export function firstAttribute(
  document: XmlRead,
  name: string,
): string | undefined {
  for (const visit of walkStructure(document)) {
    const value = attributeOf(visit.node, name);
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * The value of attribute `name` on the first element named `element` (as the
 * document spells it) that carries it, in {@link walkStructure}'s order.
 */
export function firstAttributeOn(
  document: XmlRead,
  element: string,
  name: string,
): string | undefined {
  for (const { node } of membersNamed(document, element)) {
    const value = attributeOf(node, name);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** `answer.data` as text, without pretending an object was ever a string. */
export function rawOf(answer: IAdtWireResponse): string {
  const body = answer.data;
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
    status: answer.status,
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
 * they carry the XML through as a string inside that JSON. `handleGetClass`
 * (`part: metadata`) puts the document in a `metadata` field verbatim and has never
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
