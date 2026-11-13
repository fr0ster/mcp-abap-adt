import { isElement } from './xml/tree';

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
  if (!isElement(value)) return undefined;
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
