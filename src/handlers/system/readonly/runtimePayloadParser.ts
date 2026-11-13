import { XMLParser } from 'fast-xml-parser';
import { type JsonValue, jsonOf } from '../../../lib/json';

const runtimeXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

/**
 * Convert ADT XML payload to JSON object when payload is XML text, its
 * parse checked once ({@link jsonOf}). If payload is not XML text, or its
 * parse is not JSON, returns it as-is.
 */
export function parseRuntimePayloadToJson(payload: string): JsonValue {
  const trimmed = payload.trim();
  if (!trimmed.startsWith('<')) {
    return payload;
  }

  let parsed: unknown;
  try {
    parsed = runtimeXmlParser.parse(trimmed);
  } catch {
    return payload;
  }
  const json = jsonOf(parsed);
  return json === undefined ? payload : json;
}
