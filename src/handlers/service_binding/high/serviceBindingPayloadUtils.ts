import { XMLParser } from 'fast-xml-parser';
import { type JsonValue, jsonOf, parseJson } from '../../../lib/json';

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
 * (`plain`, or a document that does not parse), else its parse, checked once
 * ({@link jsonOf}).
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

  let parsed: unknown;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    });
    parsed = parser.parse(trimmed);
  } catch {
    return payload;
  }
  const json = jsonOf(parsed);
  return json === undefined ? payload : json;
}
