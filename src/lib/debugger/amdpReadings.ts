/**
 * AMDP debugger documents, in the shapes the adt-clients AMDP integration
 * test reads (measured on premise and on the cloud, 2026-10-09).
 */
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  isArray: (n) =>
    ['mainResponse', 'variable', 'columns', 'data', 'breakpoint'].includes(n),
});
const text = (v: unknown): string =>
  v === undefined || v === null
    ? ''
    : typeof v === 'object'
      ? String((v as Record<string, unknown>)['#text'] ?? '')
      : String(v);

export interface AmdpEvent {
  kind: string;
  requestId: string;
  debuggeeId: string;
  line?: number;
  variables: Array<{ name: string; value: string }>;
  states: string[];
  body: string;
}

// A mainResponse either closes itself or runs to its closing tag — a child's `/>` does not end it.
const MAIN_RESPONSE =
  /<(?:[\w.-]+:)?mainResponse\b(?:[^>]*?\/>|[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?mainResponse>)/g;

export function readAmdpEvents(xml: string): AmdpEvent[] {
  if (!xml?.trim()) return [];
  const doc = parser.parse(xml);
  const root = doc.events && typeof doc.events === 'object' ? doc.events : doc;
  const rows: any[] = root.mainResponse ?? [];
  const bodies = [...xml.matchAll(MAIN_RESPONSE)].map((m) => m[0]);
  return rows.map((r, i) => {
    const start = /#start=(\d+)/.exec(text(r.abapPosition?.uri))?.[1];
    return {
      kind: text(r.kind),
      requestId: text(r.requestId),
      debuggeeId: text(r.debuggeeId),
      ...(start ? { line: Number(start) } : {}),
      variables: (r.variable ?? []).map((v: any) => ({
        name: text(v.name),
        value: text(v.isNullValue) === 'true' ? 'NULL' : text(v),
      })),
      states: (r.breakpoint ?? []).map((b: any) => text(b.state)),
      body: bodies[i] ?? '',
    };
  });
}

/** The last path segment of `Location`. */
export function locationId(wire: {
  headers?: Record<string, unknown>;
}): string {
  const location = String(
    wire.headers?.location ?? wire.headers?.Location ?? '',
  );
  return /\/([^/?]+)\/?(?:\?.*)?$/.exec(location)?.[1] ?? '';
}

export function readAmdpStart(wire: {
  headers?: Record<string, unknown>;
  data?: unknown;
}): { mainId: string; hanaSession: string } {
  const body = String(wire.data ?? '');
  const property = /<[^>]*HANA_SESSION_ID[^>]*>/.exec(body)?.[0] ?? '';
  return {
    mainId: locationId(wire),
    hanaSession: /\bvalue="([^"]*)"/.exec(property)?.[1] ?? '',
  };
}

export function readAmdpPreview(xml: string): {
  rows: Array<Record<string, string>>;
  columns: string[];
} {
  const table = parser.parse(xml ?? '').tableData;
  const columns: any[] =
    table && typeof table === 'object' ? (table.columns ?? []) : [];
  const names = columns.map((c) => text(c.metadata?.name));
  const values: string[][] = columns.map((c) =>
    (c.dataSet?.data ?? []).map(text),
  );
  const count = Math.max(0, ...values.map((v) => v.length));
  const rows = Array.from({ length: count }, (_, i) =>
    Object.fromEntries(names.map((n, j) => [n, values[j][i] ?? ''])),
  );
  return { columns: names, rows };
}

export function terseAmdpEvent(e: AmdpEvent): {
  kind: string;
  line?: number;
  variables: Array<{ name: string; value: string }>;
} {
  return {
    kind: e.kind,
    ...(e.line !== undefined ? { line: e.line } : {}),
    variables: e.variables,
  };
}
