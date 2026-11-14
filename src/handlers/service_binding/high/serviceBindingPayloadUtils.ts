import { XMLParser } from 'fast-xml-parser';
import { type JsonValue, jsonOfNode, parseJson } from '../../../lib/json';
import { parseXml, type XmlNode } from '../../../lib/xml/node';

export type ServiceBindingResponseFormat = 'xml' | 'json' | 'plain';

export function resolveServiceBindingAcceptHeader(
  format: ServiceBindingResponseFormat,
): string {
  if (format === 'json') {
    return 'application/json';
  }
  if (format === 'plain') {
    return 'text/plain';
  }
  return 'application/vnd.sap.adt.businessservices.servicebinding.v2+xml';
}

/**
 * A service binding's answer in the format asked for: the text as it came
 * (`plain`, or a document that does not parse), else its parse, typed at the parse
 * ({@link parseXml}).
 */
export function parseServiceBindingPayload(
  payload: string,
  format: ServiceBindingResponseFormat,
): JsonValue {
  if (format === 'plain') {
    return payload;
  }

  if (format === 'json') {
    const json = parseJson(payload);
    return json === undefined ? payload : json;
  }

  const trimmed = payload.trim();
  if (!trimmed.startsWith('<')) {
    return payload;
  }

  let parsed: XmlNode | undefined;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    });
    parsed = parseXml(parser, trimmed);
  } catch {
    return payload;
  }
  return parsed === undefined ? payload : jsonOfNode(parsed);
}
