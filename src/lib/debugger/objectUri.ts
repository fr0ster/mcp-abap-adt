import type { AdtTypeCode } from '@mcp-abap-adt/interfaces-adt';
import type { AdtNeed } from '../adtProjections';
import { acceptedOf } from '../adtTypeCode';
import { digitsAfter } from '../plainText';

/**
 * The source a line breakpoint names, from what a model knows — a type and a
 * name — and back. adt-clients does not export its URI builders, so the four
 * kinds that hold executable ABAP are spelled here as ADT spells them.
 *
 * The debugger's own labels, each with the code of the tables it stands for:
 * a label outside this union, or a code no table holds, does not compile.
 * `FUNC` is a function module (`FUGR/FF`, as the releases' quick search names
 * it), never a group.
 */
export const BREAKPOINT_OBJECT_CODES = {
  CLAS: 'CLAS/OC',
  PROG: 'PROG/P',
  INCL: 'PROG/I',
  FUNC: 'FUGR/FF',
} as const satisfies Readonly<Record<string, AdtTypeCode>>;

/** A label of {@link BREAKPOINT_OBJECT_CODES}: the debugger's one union. */
export type BreakpointLabel = keyof typeof BREAKPOINT_OBJECT_CODES;

/** The labels, in order: what a breakpoint's `object_type` names. */
export const BREAKPOINT_OBJECT_TYPES = [
  'CLAS',
  'PROG',
  'INCL',
  'FUNC',
] as const satisfies readonly BreakpointLabel[];

/**
 * What a debug session runs once listening, each with the API whose `run`
 * it is: a run kind outside the tables' `run` does not compile.
 */
export const RUN_KIND_ROUTES = {
  class: { api: 'class', operation: 'run' },
  program: { api: 'program', operation: 'run' },
} as const satisfies Readonly<Record<string, AdtNeed>>;

/** A kind a debug session runs. */
export type RunKind = keyof typeof RUN_KIND_ROUTES;

/** The run kinds, in order: what `run.kind` names. */
export const RUN_KINDS = [
  'class',
  'program',
] as const satisfies readonly RunKind[];

export interface BreakpointTarget {
  object_type: string;
  object_name: string;
  include?: string | undefined;
  parent_name?: string | undefined;
}
export interface ObjectAddress {
  object_type: string;
  object_name: string;
  include?: string;
  parent_name?: string;
  line?: number;
}

/**
 * The boundary of a breakpoint's `object_type`: a label, or the code it
 * stands for, either case; `undefined` for any other text.
 */
export function breakpointLabelOf(text: string): BreakpointLabel | undefined {
  const label = acceptedOf(text.trim(), BREAKPOINT_OBJECT_TYPES);
  if (label !== undefined) return label;
  const code = text.trim().toUpperCase();
  return BREAKPOINT_OBJECT_TYPES.find(
    (each) => BREAKPOINT_OBJECT_CODES[each] === code,
  );
}

const seg = (name: string) => encodeURIComponent(name.trim().toLowerCase());
const unseg = (s: string) => decodeURIComponent(s).toUpperCase();

/** The ADT URI of the source a target names. Throws for a kind that holds no breakpoint. */
export function sourceUriOf(target: BreakpointTarget): string {
  const kind = breakpointLabelOf(target.object_type);
  const name = seg(target.object_name);
  switch (kind) {
    case 'CLAS':
      return target.include && target.include.toLowerCase() !== 'main'
        ? `/sap/bc/adt/oo/classes/${name}/includes/${seg(target.include)}`
        : `/sap/bc/adt/oo/classes/${name}/source/main`;
    case 'PROG':
      return `/sap/bc/adt/programs/programs/${name}/source/main`;
    case 'INCL':
      return `/sap/bc/adt/programs/includes/${name}/source/main`;
    case 'FUNC':
      if (!target.parent_name) {
        throw new Error(
          'a function module needs parent_name (its function group)',
        );
      }
      return `/sap/bc/adt/functions/groups/${seg(target.parent_name)}/fmodules/${name}/source/main`;
    default:
      throw new Error(
        `object_type ${target.object_type} holds no breakpoint; one of ${BREAKPOINT_OBJECT_TYPES.join(', ')}`,
      );
  }
}

/** The URI of one line of a target's source. */
export function lineUriOf(target: BreakpointTarget, line: number): string {
  return `${sourceUriOf(target)}#start=${line}`;
}

/**
 * The `count` non-empty segments of `path` after `prefix`, when it starts
 * with `prefix` and holds exactly so many; `undefined` otherwise.
 */
function segmentsAfter(
  path: string,
  prefix: string,
  count: number,
): string[] | undefined {
  if (!path.startsWith(prefix)) return undefined;
  const segments = path.slice(prefix.length).split('/');
  return segments.length === count && segments.every((s) => s !== '')
    ? segments
    : undefined;
}

/** The inverse of `lineUriOf`, for answers; `undefined` for a URI of no known kind. */
export function addressOf(uri: string): ObjectAddress | undefined {
  if (!uri) return undefined;
  const [path, fragment = ''] = uri.split('#');
  const start = digitsAfter(
    fragment,
    'start=',
    (before) => before === undefined || ';,&'.includes(before),
  );
  const line = start ? { line: Number(start) } : {};
  const klass = segmentsAfter(path, '/sap/bc/adt/oo/classes/', 3);
  if (
    klass !== undefined &&
    ((klass[1] === 'source' && klass[2] === 'main') || klass[1] === 'includes')
  ) {
    const label: BreakpointLabel = 'CLAS';
    return {
      object_type: label,
      object_name: unseg(klass[0]),
      ...(klass[1] === 'includes'
        ? { include: decodeURIComponent(klass[2]) }
        : {}),
      ...line,
    };
  }
  const program = segmentsAfter(path, '/sap/bc/adt/programs/', 4);
  if (
    program !== undefined &&
    (program[0] === 'programs' || program[0] === 'includes') &&
    program[2] === 'source' &&
    program[3] === 'main'
  ) {
    const label: BreakpointLabel = program[0] === 'programs' ? 'PROG' : 'INCL';
    return {
      object_type: label,
      object_name: unseg(program[1]),
      ...line,
    };
  }
  const module = segmentsAfter(path, '/sap/bc/adt/functions/groups/', 5);
  if (
    module !== undefined &&
    module[1] === 'fmodules' &&
    module[3] === 'source' &&
    module[4] === 'main'
  ) {
    const label: BreakpointLabel = 'FUNC';
    return {
      object_type: label,
      object_name: unseg(module[2]),
      parent_name: unseg(module[0]),
      ...line,
    };
  }
  return undefined;
}
