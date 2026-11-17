import { type JsonValue, parseJson } from './json';

/**
 * A text read as JSON, typed at the parse ({@link parseJson}): a JSON value,
 * `undefined` when the text is no JSON.
 */
export function jsonOf(text: string): JsonValue | undefined {
  return parseJson(text);
}
