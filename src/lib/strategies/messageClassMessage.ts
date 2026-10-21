import { parseStructure } from './reading';

/**
 * One message of a message class, read out of the class document ADT answers
 * a message read with.
 *
 * ADT has no resource for a single message: a read answers the whole class,
 * every message in it (measured on premise, BASIS 816, 2026-10-21: a class of
 * 900 messages answered 613,165 bytes for one of them). Each message is an
 * `mc:messages` element under `mc:messageClass`, its fields as attributes —
 * `mc:msgno`, `mc:msgtext`, `mc:selfexplainatory`, `mc:documented`,
 * `mc:lastchangedby`, `mc:lastmodified`, `adtcore:name` — and its links as
 * `atom:link` children.
 */
export interface ClassMessage {
  /** The element's attributes, each under its name without the prefix. */
  readonly fields: Record<string, string>;
  /** The element as parsed, attributes verbatim, children included. */
  readonly element: unknown;
}

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value === undefined ? [] : [value];

const attributesOf = (element: unknown): Record<string, unknown> => {
  const group = (element as { '@'?: unknown } | null | undefined)?.['@'];
  return group !== null && typeof group === 'object'
    ? (group as Record<string, unknown>)
    : {};
};

/**
 * The attributes under their local names. A local name two prefixes share
 * keeps both, each under its full name, so neither hides the other.
 */
function localFields(
  attributes: Record<string, unknown>,
): Record<string, string> {
  const local = (name: string) => name.slice(name.indexOf(':') + 1);
  const counts = new Map<string, number>();
  for (const name of Object.keys(attributes)) {
    counts.set(local(name), (counts.get(local(name)) ?? 0) + 1);
  }
  const fields: Record<string, string> = {};
  for (const [name, value] of Object.entries(attributes)) {
    const key = counts.get(local(name)) === 1 ? local(name) : name;
    fields[key] = String(value);
  }
  return fields;
}

/** The value under the key whose local name (the part after any prefix) is `name`. */
const byLocalName = (node: unknown, name: string): unknown => {
  if (node === null || typeof node !== 'object') return undefined;
  const key = Object.keys(node).find(
    (k) => k.slice(k.indexOf(':') + 1) === name,
  );
  return key === undefined ? undefined : (node as Record<string, unknown>)[key];
};

/**
 * The message numbered `msgno` in `document`, compared as the string SAP
 * wrote (`001`, never `1`) — the same comparison, on the same local names
 * whatever the prefix, as the refusal of a missing number makes
 * (`analyseMessageClassMessage`). `undefined` when the document holds no such
 * message.
 */
export function classMessageOf(
  document: string,
  msgno: string,
): ClassMessage | undefined {
  const root = byLocalName(parseStructure(document), 'messageClass');
  const element = asArray(byLocalName(root, 'messages')).find(
    (m) => String(byLocalName(attributesOf(m), 'msgno') ?? '') === msgno,
  );
  if (element === undefined) return undefined;
  return { fields: localFields(attributesOf(element)), element };
}
