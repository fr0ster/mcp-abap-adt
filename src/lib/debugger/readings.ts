/**
 * What a model reads of the ABAP debugger's documents. adt-clients answers
 * the documents as they came; refining them is the server's (the layer
 * split). Every reading is checked against a recorded answer.
 */
import { readExceptionSubType } from '@mcp-abap-adt/adt-strategies';
import type { IDebuggerBreakpoint } from '@mcp-abap-adt/interfaces-adt';
import { XMLParser } from 'fast-xml-parser';
import { addressOf, type ObjectAddress } from './objectUri';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  isArray: (name) =>
    [
      'STPDA_DEBUGGEE',
      'STPDA_ADT_VARIABLE',
      'STPDA_ADT_VARIABLE_HIERARCHY',
      'stackEntry',
      'breakpoint',
    ].includes(name),
});

type Node = Record<string, any>;
const parse = (xml: string): Node => (xml?.trim() ? parser.parse(xml) : {});
const text = (v: unknown): string =>
  v === undefined || v === null || typeof v === 'object' ? '' : String(v);
const num = (v: unknown): number => Number(text(v).trim() || 0);
const bool = (v: unknown): boolean => text(v) === 'true';

export interface DebuggeeReading {
  debuggeeId: string;
  user: string;
  program: string;
  include: string;
  line: number;
  uri: string;
  objectType: string;
  objectName: string;
  instance: string;
  kind: string;
}
export interface AttachReading {
  debugSessionId: string;
  isSteppingPossible: boolean;
  isTerminationPossible: boolean;
  reachedBreakpoints: string[];
}
export interface FrameReading {
  position: number;
  program: string;
  include: string;
  line: number;
  eventType: string;
  event: string;
  uri: string;
  systemProgram: boolean;
}
export interface StackReading {
  cursor: number;
  frames: FrameReading[];
}
export interface VariableReading {
  id: string;
  name: string;
  type: string;
  metaType: string;
  value: string;
  tableLines: number;
}
export interface VariablesReading {
  variables: VariableReading[];
  children: Array<{ parent: string; child: string; label: string }>;
}
export interface BreakpointReading {
  id?: string;
  kind: string;
  uri?: string;
  exceptionClass?: string;
  statement?: string;
  msgId?: string;
  msgNo?: string;
  msgTy?: string;
  condition?: string;
  error?: string;
}
export type DebuggeeEnd = 'debuggeeEnded' | 'terminateDebuggee';

export function readDebuggee(xml: string): DebuggeeReading | undefined {
  const row = parse(xml)?.abap?.values?.DATA?.STPDA_DEBUGGEE?.[0];
  if (!row) return undefined;
  return {
    debuggeeId: text(row.DEBUGGEE_ID),
    user: text(row.DEBUGGEE_USER),
    program: text(row.PRG_CURR),
    include: text(row.INCL_CURR),
    line: num(row.LINE_CURR),
    uri: text(row.URI),
    objectType: text(row.TYPE),
    objectName: text(row.NAME),
    instance: text(row.INSTANCE_NAME),
    kind: text(row.DBGEE_KIND),
  };
}

export function readAttach(xml: string): AttachReading {
  const a = parse(xml)?.attach ?? {};
  const reached = a.reachedBreakpoints?.breakpoint ?? [];
  return {
    debugSessionId: text(a.debugSessionId),
    isSteppingPossible: bool(a.isSteppingPossible),
    isTerminationPossible: bool(a.isTerminationPossible),
    reachedBreakpoints: reached.map((b: Node) => text(b.id)),
  };
}

export function readStack(xml: string): StackReading {
  const s = parse(xml)?.stack ?? {};
  const frames: FrameReading[] = (s.stackEntry ?? []).map((e: Node) => ({
    position: num(e.stackPosition),
    program: text(e.programName),
    include: text(e.includeName),
    line: num(e.line),
    eventType: text(e.eventType),
    event: text(e.eventName),
    uri: text(e.uri),
    systemProgram: bool(e.systemProgram),
  }));
  return { cursor: num(s.debugCursorStackIndex), frames };
}

export function readVariables(xml: string): VariablesReading {
  const data = parse(xml)?.abap?.values?.DATA ?? {};
  const rows: Node[] =
    data.VARIABLES?.STPDA_ADT_VARIABLE ?? data.STPDA_ADT_VARIABLE ?? [];
  const links: Node[] = data.HIERARCHIES?.STPDA_ADT_VARIABLE_HIERARCHY ?? [];
  return {
    variables: rows.map((r) => ({
      id: text(r.ID),
      name: text(r.NAME),
      type: text(r.DECLARED_TYPE_NAME),
      metaType: text(r.META_TYPE),
      value: text(r.VALUE).trimEnd(),
      tableLines: num(r.TABLE_LINES),
    })),
    children: links.map((l) => ({
      parent: text(l.PARENT_ID),
      child: text(l.CHILD_ID),
      label: text(l.CHILD_NAME),
    })),
  };
}

export function readBreakpoints(xml: string): BreakpointReading[] {
  return (parse(xml)?.breakpoints?.breakpoint ?? []).map((b: Node) => {
    const r: BreakpointReading = { kind: text(b.kind) };
    for (const k of [
      'id',
      'uri',
      'exceptionClass',
      'statement',
      'msgId',
      'msgNo',
      'msgTy',
      'condition',
    ] as const) {
      const v = text(b[k]);
      if (v) r[k] = v;
    }
    const error = text(b.errorMessage);
    if (error) r.error = error;
    return r;
  });
}

/** The content a breakpoint is matched by — never its position (the answer reorders). */
export function breakpointKey(
  b: BreakpointReading | IDebuggerBreakpoint,
): string {
  const x = b as BreakpointReading;
  switch (x.kind) {
    case 'line':
      return `line|${x.uri ?? ''}`;
    case 'exception':
      return `exception|${(x.exceptionClass ?? '').toUpperCase()}`;
    case 'statement':
      return `statement|${(x.statement ?? '').toUpperCase()}`;
    case 'message':
      return `message|${x.msgId}|${x.msgNo}|${x.msgTy}`.toUpperCase();
    default:
      return `${x.kind}|`;
  }
}

const ENDS = new Set<DebuggeeEnd>(['debuggeeEnded', 'terminateDebuggee']);
export function readDebuggeeEnd(body: string): DebuggeeEnd | undefined {
  const sub = readExceptionSubType(body);
  return sub && ENDS.has(sub as DebuggeeEnd) ? (sub as DebuggeeEnd) : undefined;
}

export interface PlaceReading {
  address?: ObjectAddress;
  unit: string;
  program: string;
  include: string;
  include_line: number;
}

export function placeOf(frame: FrameReading): PlaceReading {
  const address = addressOf(frame.uri);
  return {
    ...(address ? { address } : {}),
    unit: frame.event,
    program: frame.program,
    include: frame.include,
    include_line: frame.line,
  };
}

export function terseStop(debuggee: DebuggeeReading, stack: StackReading) {
  const top = stack.frames[0];
  const at: PlaceReading = top
    ? placeOf(top)
    : {
        ...(addressOf(debuggee.uri)
          ? { address: addressOf(debuggee.uri) }
          : {}),
        unit: '',
        program: debuggee.program,
        include: debuggee.include,
        include_line: debuggee.line,
      };
  return { at, frames: stack.frames.slice(0, 5).map(placeOf) };
}

export function terseVariables(r: VariablesReading) {
  return r.variables.map((v) => ({
    name: v.name,
    type: v.type,
    value: v.value,
    ...(v.metaType === 'table' ? { rows: v.tableLines } : {}),
  }));
}
