/**
 * A message's `href` read into the source it points into and the position
 * in it.
 *
 * ADT writes a source position in an href's fragment, its parts separated by
 * `;`: `…/source/main#start=16,15`, `…/source/main#start=3,17;end=3,29`
 * (activation checklists and check runs, measured; lines from 1, columns
 * from 0), and `#type=CLAS%2FOM;name=POST;start=29` (a line with no column,
 * the debugger's and ATC's). A checklist `msg`'s own `line` attribute is the
 * message's ordinal (`1`, `2`, … beside `#start=4,11`, `#start=2,36`), so the
 * href is where its source position is read.
 *
 * Plain string code: no regular expression runs over SAP's text.
 */
import { isAsciiDigits } from './plainText';

/** A point in a source: its line (from 1) and its column (from 0). */
export type SourcePoint = {
  readonly line: number;
  readonly column: number;
};

/** Where a message stands: its start, and its end where the href states one. */
export type SourcePosition = SourcePoint & {
  readonly end?: SourcePoint;
};

/** What an href names: the source's uri, and the position in it when stated. */
export type SourceHref = {
  readonly uri: string;
  readonly position?: SourcePosition;
};

/** A fragment's `start`: its line, and its column where it states one. */
export interface FragmentStart {
  readonly line: number;
  readonly column?: number;
}

/** An href split at its first `#`: the uri, and the fragment when there is one. */
export function hrefParts(href: string): {
  uri: string;
  fragment?: string;
} {
  const hash = href.indexOf('#');
  return hash < 0
    ? { uri: href }
    : { uri: href.slice(0, hash), fragment: href.slice(hash + 1) };
}

/**
 * The value of the one `;`-separated part of `fragment` named `key`
 * (`key=value`); `undefined` when no part is, or when several are.
 */
function fragmentValue(fragment: string, key: string): string | undefined {
  const marker = `${key}=`;
  const values = fragment
    .split(';')
    .filter((part) => part.startsWith(marker))
    .map((part) => part.slice(marker.length));
  const [only, other] = values;
  return other === undefined ? only : undefined;
}

/** `LINE` or `LINE,COLUMN`, each one or more ASCII digits; anything else is none. */
function pointOf(text: string): FragmentStart | undefined {
  const comma = text.indexOf(',');
  const line = comma < 0 ? text : text.slice(0, comma);
  if (!isAsciiDigits(line)) return undefined;
  if (comma < 0) return { line: Number(line) };
  const column = text.slice(comma + 1);
  if (!isAsciiDigits(column)) return undefined;
  return { line: Number(line), column: Number(column) };
}

/** The `start` a fragment states — its line, and its column where given; none when it states none or one that does not read. */
export function fragmentStart(fragment: string): FragmentStart | undefined {
  const start = fragmentValue(fragment, 'start');
  return start === undefined ? undefined : pointOf(start);
}

/** A `LINE,COLUMN` point; none for a line alone or anything else. */
function fullPoint(text: string | undefined): SourcePoint | undefined {
  if (text === undefined) return undefined;
  const point = pointOf(text);
  return point?.column === undefined
    ? undefined
    : { line: point.line, column: point.column };
}

/**
 * The position a fragment states: `start=L,C`, with `end=L,C` where it
 * states one. None for a fragment with no `start`, a `start` without both
 * numbers, or an `end` that is there and does not read.
 */
function positionOf(fragment: string): SourcePosition | undefined {
  const start = fullPoint(fragmentValue(fragment, 'start'));
  if (start === undefined) return undefined;
  const endText = fragmentValue(fragment, 'end');
  if (endText === undefined) return start;
  const end = fullPoint(endText);
  return end === undefined ? undefined : { ...start, end };
}

/**
 * A message's `href` read: the uri before its fragment, and the position the
 * fragment states. An empty href names nothing (`undefined`); an href with
 * no fragment, or with a fragment that states no readable position, names
 * its uri alone.
 */
export function readSourceHref(href: string): SourceHref | undefined {
  if (href === '') return undefined;
  const { uri, fragment } = hrefParts(href);
  const position = fragment === undefined ? undefined : positionOf(fragment);
  return position === undefined ? { uri } : { uri, position };
}
