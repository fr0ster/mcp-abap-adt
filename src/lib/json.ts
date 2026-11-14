import { isElement } from './outsideValue';
import type { XmlNode } from './xml/node';

/**
 * A JSON value: what `JSON.parse` and the XML-to-object parsers answer, once
 * checked ({@link jsonOf}). Parsed output is data from outside the type
 * system, checked once where it is parsed and typed so everywhere after.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A JSON object: a JSON value that is neither a list nor a scalar. */
export type JsonObject = { [key: string]: JsonValue };

/** Whether a JSON value is an object ({@link JsonObject}). */
export function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The member at `path` under a JSON value: at each step an object's own
 * member (never one it inherits), else `undefined`.
 */
export function jsonAt(
  value: JsonValue | undefined,
  ...path: readonly string[]
): JsonValue | undefined {
  let node = value;
  for (const name of path) {
    if (node === undefined || !isJsonObject(node) || !Object.hasOwn(node, name))
      return undefined;
    node = node[name];
  }
  return node;
}

/**
 * `value` as a JSON value, built afresh from what it holds, or `undefined`
 * when it, or anything it holds, is not one: plain code over a parser's
 * output, the one check its values pass.
 */
export function jsonOf(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const items: JsonValue[] = [];
    for (const item of value) {
      const json = jsonOf(item);
      if (json === undefined) return undefined;
      items.push(json);
    }
    return items;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  // Built by `Object.fromEntries`, which defines each member as its own: a
  // member named `__proto__` stays a member, never the copy's prototype.
  const members: [string, JsonValue][] = [];
  for (const [key, member] of Object.entries(value)) {
    const json = jsonOf(member);
    if (json === undefined) return undefined;
    members.push([key, json]);
  }
  return Object.fromEntries(members);
}

/**
 * A parsed document's node as a JSON value, built afresh: a text value as it
 * is, a list and an element member by member; no document (`null`) is
 * `null`. Typed both sides, so nothing is checked.
 */
export function jsonOfNode(node: XmlNode | null): JsonValue {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(jsonOfNode);
  return Object.fromEntries(
    Object.entries(node).map(([name, member]) => [name, jsonOfNode(member)]),
  );
}

/** `text` read as JSON and checked ({@link jsonOf}); `undefined` when it is not JSON. */
export function parseJson(text: string): JsonValue | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return jsonOf(parsed);
}

/** `text` read as JSON when it is JSON, else the text itself. */
export function jsonOrText(text: string): JsonValue {
  const json = parseJson(text);
  return json === undefined ? text : json;
}

/**
 * `fields` as a JSON object: its absent members left out, as `JSON.stringify`
 * leaves them out of the text. Built from typed values, so nothing is checked.
 */
export function jsonFields(fields: {
  readonly [key: string]: JsonValue | undefined;
}): { [key: string]: JsonValue } {
  const members: [string, JsonValue][] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) members.push([key, value]);
  }
  return Object.fromEntries(members);
}

/**
 * A value an answer writes as JSON text: a JSON value whose lists may be
 * read-only and whose members may be absent (`undefined`), which
 * `JSON.stringify` leaves out of the text. What a payload built field by
 * field holds (a failure's, a cleanup's, a projection's).
 */
export type AnswerValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly AnswerValue[]
  | AnswerObject;

/** An answer's JSON object ({@link AnswerValue}). */
export type AnswerObject = { readonly [key: string]: AnswerValue };

/**
 * `value` as JSON writes it, read back and checked ({@link parseJson}): a
 * `Date` its ISO text, a member JSON leaves out left out. `undefined` when
 * it has no JSON text (`undefined` itself, a function) or cannot be
 * serialised (a cycle). For a value from outside the type system that is
 * no parser's output (a YAML document's, a thrown carrier's).
 */
export function jsonValueOf(value: unknown): JsonValue | undefined {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    return undefined;
  }
  return text === undefined ? undefined : parseJson(text);
}

/**
 * `value` as an answer's value ({@link jsonValueOf}): it answers exactly
 * what serialising it would. The one check of a value from outside the type
 * system (a thrown carrier's) before it rides in a payload.
 */
export function answerValueOf(value: unknown): AnswerValue | undefined {
  return jsonValueOf(value);
}

/** `value` as an answer's JSON object ({@link answerValueOf}), or `undefined`. */
export function answerObjectOf(value: unknown): AnswerObject | undefined {
  if (!isElement(value)) return undefined;
  const read = answerValueOf(value);
  return read !== undefined && isAnswerObject(read) ? read : undefined;
}

/** Whether an answer's value is an object: neither a list nor a scalar. */
export function isAnswerObject(value: AnswerValue): value is AnswerObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether an answer's value is a list. */
export function isAnswerList(
  value: AnswerValue,
): value is readonly AnswerValue[] {
  return Array.isArray(value);
}
