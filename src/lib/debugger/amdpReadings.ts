/**
 * AMDP debugger documents, as the system sends them (recorded on premise,
 * 2026-10-11: the start, a sync and its events, a break, the end of a
 * debuggee, a stop, a data preview).
 */
import { XMLParser } from 'fast-xml-parser';
import { addressOf, type ObjectAddress } from './objectUri';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  isArray: (n) =>
    [
      'mainResponse',
      'variable',
      'columns',
      'data',
      'breakpoint',
      'callstackEntry',
    ].includes(n),
});
const text = (v: unknown): string =>
  v === undefined || v === null
    ? ''
    : typeof v === 'object'
      ? String((v as Record<string, unknown>)['#text'] ?? '')
      : String(v);

/** A breakpoint as the system reports it: where, its state, and its reason when it gives one. */
export interface AmdpBreakpointState {
  class_name?: string;
  line?: number;
  state: string;
  errorMessage?: string;
}

/**
 * One frame of an AMDP stop's call stack: the procedure, where it stands in
 * the ABAP source, and where in the database procedure.
 */
export interface AmdpFrame {
  index: number;
  procedure: string;
  language: string;
  type: string;
  isDebugCompiled: boolean;
  /** The ABAP source position, its line in `#start=`. */
  uri: string;
  /** The object as the system types it, the subtype included. */
  objectType: string;
  objectName: string;
  line?: number;
  schema: string;
  nativeLine?: number;
}

export interface AmdpEvent {
  kind: string;
  requestId: string;
  debuggeeId: string;
  line?: number;
  variables: Array<{ name: string; value: string }>;
  breakpoints: AmdpBreakpointState[];
  /** The call stack an ON_BREAK carries, in the order the system sends it. */
  stack?: AmdpFrame[];
  body: string;
}

const lineOf = (uri: unknown): number | undefined => {
  const start = /#start=(\d+)/.exec(text(uri))?.[1];
  return start ? Number(start) : undefined;
};

function breakpointState(b: any): AmdpBreakpointState {
  const name = text(b.name);
  const line = lineOf(b.uri);
  const errorMessage = text(b.errorMessage).trim();
  return {
    ...(name ? { class_name: name } : {}),
    ...(line !== undefined ? { line } : {}),
    state: text(b.state),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

type Attributes = Record<string, unknown>;
function frameOf(
  f: Attributes & { abapPosition?: Attributes; nativePosition?: Attributes },
): AmdpFrame {
  const abap = f.abapPosition ?? {};
  const native = f.nativePosition ?? {};
  const line = lineOf(abap.uri);
  const nativeLine = text(native.line).trim();
  return {
    index: Number(text(f.index).trim() || 0),
    procedure: text(abap.procedureName) || text(native.procedureName),
    language: text(f.language),
    type: text(f.type),
    isDebugCompiled: text(f.isDebugCompiled) === 'true',
    uri: text(abap.uri),
    objectType: text(abap.type),
    objectName: text(abap.name),
    ...(line !== undefined ? { line } : {}),
    schema: text(native.schemaName),
    ...(nativeLine ? { nativeLine: Number(nativeLine) } : {}),
  };
}

// A mainResponse either closes itself or runs to its closing tag — a child's `/>` does not end it.
const MAIN_RESPONSE =
  /<(?:[\w.-]+:)?mainResponse\b(?:[^>]*?\/>|[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?mainResponse>)/g;

/**
 * Every value under `key` at any depth: the event's parts sit at different
 * depths by kind (a sync's breakpoints under value/syncBreakpoints/breakpoints,
 * measured on premise 2026-10-11), and the reading must not depend on that.
 */
function deep(node: unknown, key: string): any[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((n) => deep(n, key));
  const found: any[] = [];
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === key) found.push(...(Array.isArray(v) ? v : [v]));
    else found.push(...deep(v, key));
  }
  return found;
}

export function readAmdpEvents(xml: string): AmdpEvent[] {
  if (!xml?.trim()) return [];
  const doc = parser.parse(xml);
  // The system answers a mainResponseList (measured on premise, 2026-10-11).
  const root =
    doc.mainResponseList && typeof doc.mainResponseList === 'object'
      ? doc.mainResponseList
      : doc;
  const rows: any[] = root.mainResponse ?? [];
  const bodies = [...xml.matchAll(MAIN_RESPONSE)].map((m) => m[0]);
  return rows.map((r, i) => {
    const line = lineOf(deep(r, 'abapPosition')[0]?.uri);
    const frames = deep(r, 'callstackEntry');
    return {
      kind: text(r.kind),
      requestId: text(r.requestId),
      debuggeeId: text(r.debuggeeId),
      ...(line !== undefined ? { line } : {}),
      variables: deep(r, 'variable').map((v: any) => ({
        name: text(v.name),
        value: text(v.isNullValue) === 'true' ? 'NULL' : text(v),
      })),
      breakpoints: deep(r, 'breakpoint').map(breakpointState),
      ...(frames.length ? { stack: frames.map(frameOf) } : {}),
      body: bodies[i] ?? '',
    };
  });
}

/**
 * The last path segment of `Location` — or the whole of it: the start names
 * its session by a path, the breakpoint sync its request by a bare id
 * (measured on premise, 2026-10-11).
 */
export function locationId(wire: {
  headers?: Record<string, unknown>;
}): string {
  const location = String(
    wire.headers?.location ?? wire.headers?.Location ?? '',
  ).trim();
  return /(?:^|\/)([^/?]+)\/?(?:\?.*)?$/.exec(location)?.[1] ?? '';
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

/**
 * A frame as a model acts on it: the procedure, the ABAP address a breakpoint
 * or a read takes, and the line in the database procedure. Language, frame
 * type and index are left out; a frame not compiled for debugging is named,
 * since it cannot be stepped in.
 */
export interface TerseAmdpFrame {
  procedure: string;
  address?: ObjectAddress;
  native_line?: number;
  not_debug_compiled?: true;
}

export function terseAmdpFrame(f: AmdpFrame): TerseAmdpFrame {
  const address =
    addressOf(f.uri) ??
    (f.objectName
      ? {
          object_type: f.objectType,
          object_name: f.objectName,
          ...(f.line !== undefined ? { line: f.line } : {}),
        }
      : undefined);
  return {
    procedure: f.procedure,
    ...(address ? { address } : {}),
    ...(f.nativeLine !== undefined ? { native_line: f.nativeLine } : {}),
    ...(f.isDebugCompiled ? {} : { not_debug_compiled: true as const }),
  };
}

/** Shortens by count, never by precision: the ids that tell events apart stay. */
export function terseAmdpEvent(e: AmdpEvent): {
  kind: string;
  requestId?: string;
  debuggeeId?: string;
  line?: number;
  variables: Array<{ name: string; value: string }>;
  breakpoints?: AmdpBreakpointState[];
  stack?: TerseAmdpFrame[];
} {
  return {
    kind: e.kind,
    ...(e.requestId ? { requestId: e.requestId } : {}),
    ...(e.debuggeeId ? { debuggeeId: e.debuggeeId } : {}),
    ...(e.line !== undefined ? { line: e.line } : {}),
    variables: e.variables,
    // An INVALID breakpoint and the system's reason reach the model.
    ...(e.breakpoints.length ? { breakpoints: e.breakpoints } : {}),
    // The top frames, as the ABAP stop keeps them (terseStop).
    ...(e.stack?.length
      ? { stack: e.stack.slice(0, 5).map(terseAmdpFrame) }
      : {}),
  };
}
