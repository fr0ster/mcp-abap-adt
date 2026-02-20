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
  payload: unknown,
  format: ServiceBindingResponseFormat,
): unknown {
  if (format === 'plain') {
    return payload;
  }

  if (format === 'json') {
    if (typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch {
        return payload;
      }
    }
    return payload;
  }

  if (typeof payload !== 'string') {
    return payload;
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
