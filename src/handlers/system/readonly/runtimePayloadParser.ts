import { XMLParser } from 'fast-xml-parser';

const runtimeXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

/**
 * Convert ADT XML payload to JSON object when payload is XML text.
 * If payload is not XML text, returns it as-is.
 */
export function parseRuntimePayloadToJson(payload: unknown): unknown {
  if (typeof payload !== 'string') {
    return payload;
  }

  const trimmed = payload.trim();
  if (!trimmed.startsWith('<')) {
    return payload;
  }

  try {
    return runtimeXmlParser.parse(trimmed);
  } catch {
    return payload;
  }
}

