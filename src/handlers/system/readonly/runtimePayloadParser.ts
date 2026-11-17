import { XMLParser } from 'fast-xml-parser';
import { type JsonValue, jsonOfNode } from '../../../lib/json';
import { parseXml, type XmlNode } from '../../../lib/xml/node';

const runtimeXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

/**
 * Convert ADT XML payload to JSON object when payload is XML text, its
 * parse typed at the parse ({@link parseXml}). If payload is not XML text, or its
 * parse is not JSON, returns it as-is.
 */
export function parseRuntimePayloadToJson(payload: string): JsonValue {
  const trimmed = payload.trim();
  if (!trimmed.startsWith('<')) {
    return payload;
  }

  let parsed: XmlNode | undefined;
  try {
    parsed = parseXml(runtimeXmlParser, trimmed);
  } catch {
    return payload;
  }
  return parsed === undefined ? payload : jsonOfNode(parsed);
}
