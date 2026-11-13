import { XMLParser } from 'fast-xml-parser';

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

export function parseServiceBindingPayload(
  payload: string,
  format: ServiceBindingResponseFormat,
): unknown {
  if (format === 'plain') {
    return payload;
  }

  if (format === 'json') {
    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  }

  const trimmed = payload.trim();
  if (!trimmed.startsWith('<')) {
    return payload;
  }

  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    });
    return parser.parse(trimmed);
  } catch {
    return payload;
  }
}
