/**
 * AMDP debugger documents, as the system sends them (recorded on premise,
 * 2026-10-11: the start, a sync and its events, a break, the end of a
 * debuggee, a stop, a data preview).
 */

import { XMLParser } from 'fast-xml-parser';
import { digitsAfter } from '../plainText';
import { parseXml, type XmlNode } from '../xml/node';
import { buildOrdered, ORDERED_ATTRIBUTES, parseOrdered } from '../xml/ordered';
import {
  attr,
  child,
  childAt,
  entries,
  isList,
  listOf,
  localName,
  walk,
  type XmlRead,
} from '../xml/tree';
import { addressOf, type ObjectAddress } from './objectUri';
import { terseFrames } from './readings';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  // Character references decoded as `parseStructure` decodes them.
  htmlEntities: true,
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
/** A document parsed with this module's parser, or nothing for a body that is not XML. */
function parseOrEmpty(xml: string): XmlNode | undefined {
  try {
    return parseXml(parser, xml);
  } catch {
    return undefined;
  }
}
const text = (v: XmlRead): string =>
  v === undefined || v === null
    ? ''
    : typeof v === 'object'
      ? String(child(v, '#text') ?? '')
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

const lineOf = (uri: XmlRead): number | undefined => {
  const start = digitsAfter(text(uri), '#start=');
  return start ? Number(start) : undefined;
};

function breakpointState(b: XmlNode): AmdpBreakpointState {
  const name = text(child(b, 'name'));
  const line = lineOf(child(b, 'uri'));
  const errorMessage = text(child(b, 'errorMessage')).trim();
  return {
    ...(name ? { class_name: name } : {}),
    ...(line !== undefined ? { line } : {}),
    state: text(child(b, 'state')),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

function frameOf(f: XmlNode): AmdpFrame {
  const abap = child(f, 'abapPosition');
  const native = child(f, 'nativePosition');
  const line = lineOf(child(abap, 'uri'));
  const nativeLine = text(child(native, 'line')).trim();
  return {
    index: Number(text(child(f, 'index')).trim() || 0),
    procedure:
      text(child(abap, 'procedureName')) ||
      text(child(native, 'procedureName')),
    language: text(child(f, 'language')),
    type: text(child(f, 'type')),
    isDebugCompiled: text(child(f, 'isDebugCompiled')) === 'true',
    uri: text(child(abap, 'uri')),
    objectType: text(child(abap, 'type')),
    objectName: text(child(abap, 'name')),
    ...(line !== undefined ? { line } : {}),
    schema: text(child(native, 'schemaName')),
    ...(nativeLine ? { nativeLine: Number(nativeLine) } : {}),
  };
}

/**
 * Each `mainResponse` of a document as text, in document order: read in the
 * ordered form and built back (`xml/ordered`), so a body is the element as
 * the system wrote it, a child's `/>` or a closing tag inside CDATA included.
 */
function mainResponseBodies(xml: string): string[] {
  const bodies: string[] = [];
  const visit = (members: XmlRead): void => {
    for (const member of listOf(members)) {
      for (const [name, content] of entries(member)) {
        if (name === ORDERED_ATTRIBUTES) continue;
        if (localName(name) === 'mainResponse') {
          bodies.push(buildOrdered([member]));
        } else {
          visit(content);
        }
      }
    }
  };
  visit(parseOrdered(xml));
  return bodies;
}

/**
 * Every value under `key` at any depth: the event's parts sit at different
 * depths by kind (a sync's breakpoints under value/syncBreakpoints/breakpoints,
 * measured on premise 2026-10-11), and the reading must not depend on that.
 */
function deep(node: XmlRead, key: string): XmlNode[] {
  if (!node || typeof node !== 'object') return [];
  if (isList(node)) return node.flatMap((n) => deep(n, key));
  const found: XmlNode[] = [];
  for (const [k, v] of entries(node)) {
    if (k === key) found.push(...(isList(v) ? v : [v]));
    else found.push(...deep(v, key));
  }
  return found;
}

export function readAmdpEvents(xml: string): AmdpEvent[] {
  if (!xml?.trim()) return [];
  const doc = parseXml(parser, xml);
  // The system answers a mainResponseList (measured on premise, 2026-10-11).
  const list = child(doc, 'mainResponseList');
  const root = list && typeof list === 'object' ? list : doc;
  const rows = listOf(child(root, 'mainResponse'));
  const bodies = mainResponseBodies(xml);
  return rows.map((r, i) => {
    const line = lineOf(child(deep(r, 'abapPosition')[0], 'uri'));
    const frames = deep(r, 'callstackEntry');
    return {
      kind: text(child(r, 'kind')),
      requestId: text(child(r, 'requestId')),
      debuggeeId: text(child(r, 'debuggeeId')),
      ...(line !== undefined ? { line } : {}),
      variables: deep(r, 'variable').map((v) => ({
        name: text(child(v, 'name')),
        value: text(child(v, 'isNullValue')) === 'true' ? 'NULL' : text(v),
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
  return lastSegmentOf(location);
}

/**
 * The last path segment of a location: the first segment — counted from
 * the start or after a `/`, holding no `/` or `?` — that only a `/`, a query
 * (`?…`) or the end follows; empty when there is none.
 */
function lastSegmentOf(location: string): string {
  for (let at = 0; at < location.length; at++) {
    if (at > 0 && location[at - 1] !== '/') continue;
    let end = at;
    while (
      end < location.length &&
      location[end] !== '/' &&
      location[end] !== '?'
    )
      end++;
    if (end === at) continue;
    const after = location[end] === '/' ? end + 1 : end;
    if (after === location.length || location[after] === '?') {
      return location.slice(at, end);
    }
  }
  return '';
}

export function readAmdpStart(wire: {
  headers?: Record<string, unknown>;
  data?: unknown;
}): { mainId: string; hanaSession: string } {
  const body = String(wire.data ?? '');
  // The start's parameters, read with this module's parser (no prefixes): the
  // one whose key is the HANA session names it in its value.
  const parameter = walk(parseOrEmpty(body)).find(
    (visit) => attr(visit.node, 'key') === 'HANA_SESSION_ID',
  );
  return {
    mainId: locationId(wire),
    hanaSession: attr(parameter?.node, 'value') ?? '',
  };
}

export function readAmdpPreview(xml: string): {
  rows: Array<Record<string, string>>;
  columns: string[];
} {
  const table = child(parseXml(parser, xml ?? ''), 'tableData');
  const columns = listOf(child(table, 'columns'));
  const names = columns.map((c) => text(childAt(c, 'metadata', 'name')));
  const values: string[][] = columns.map((c) =>
    listOf(childAt(c, 'dataSet', 'data')).map(text),
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
 * since it cannot be stepped in, and keeps no lines: the system answers its
 * method's first line and native line 0 there, not where the call stands
 * (measured on premise, 2026-10-11).
 */
export interface TerseAmdpFrame {
  procedure: string;
  address?: ObjectAddress;
  native_line?: number;
  not_debug_compiled?: true;
}

export function terseAmdpFrame(f: AmdpFrame): TerseAmdpFrame {
  const found =
    addressOf(f.uri) ??
    (f.objectName
      ? {
          object_type: f.objectType,
          object_name: f.objectName,
          ...(f.line !== undefined ? { line: f.line } : {}),
        }
      : undefined);
  if (!f.isDebugCompiled) {
    const address =
      found && (({ line: _methodLine, ...object }) => object)(found);
    return {
      procedure: f.procedure,
      ...(address ? { address } : {}),
      not_debug_compiled: true,
    };
  }
  return {
    procedure: f.procedure,
    ...(found ? { address: found } : {}),
    ...(f.nativeLine !== undefined ? { native_line: f.nativeLine } : {}),
  };
}

function terseStack(stack: AmdpFrame[]): {
  stack: TerseAmdpFrame[];
  stack_depth?: number;
} {
  const kept = terseFrames(stack, terseAmdpFrame);
  return {
    stack: kept.frames,
    ...(kept.depth ? { stack_depth: kept.depth } : {}),
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
  stack_depth?: number;
} {
  return {
    kind: e.kind,
    ...(e.requestId ? { requestId: e.requestId } : {}),
    ...(e.debuggeeId ? { debuggeeId: e.debuggeeId } : {}),
    ...(e.line !== undefined ? { line: e.line } : {}),
    variables: e.variables,
    // An INVALID breakpoint and the system's reason reach the model.
    ...(e.breakpoints.length ? { breakpoints: e.breakpoints } : {}),
    // The top frames, as the ABAP stop keeps them (terseStop): the system sends the
    // innermost first, its index counting from 1 at the outermost (measured on premise, 2026-10-11).
    ...(e.stack?.length ? terseStack(e.stack) : {}),
  };
}
