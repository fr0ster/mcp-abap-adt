/**
 * Plan step 10.5: a tool's Returns and what its writers write, tied, over
 * the tool's own fixtures:
 *
 * - the Returns is exactly the facts its schemas and heads generate — no
 *   fact more, none less;
 * - every header, head and mark a terse listing writes is declared in the
 *   schemas, and each of its nouns is in the Returns;
 * - every array a medium JSON answer holds is under a declared list's name;
 * - every declared list and every kind is reached by some fixture, so no
 *   part of the Returns goes untested.
 */

import { type ReturnsFact, returnsOf } from '../../../lib/description';
import type { HeadShape, Line, ListShape } from '../../../lib/detail';

/**
 * One fixture of a tool: the reading its terse listing wrote, the lines it
 * wrote (`writtenLines`), and its medium JSON answer.
 */
export interface TieSample {
  readonly reading: unknown;
  readonly lines: readonly Line[];
  readonly medium?: unknown;
}

/** What one tool's tie is checked over. */
export interface ReturnsTie {
  readonly terse: readonly ListShape[];
  readonly medium?: readonly ListShape[] | undefined;
  readonly heads: readonly HeadShape[];
  /** Whose facts the heads tell, as the description states them (`returnsOf`'s `of`). */
  readonly of?: string | undefined;
  /** What follows the heads in that sentence (`returnsOf`'s `by`). */
  readonly by?: string | undefined;
  readonly returns: readonly ReturnsFact[];
  readonly samples: readonly TieSample[];
}

/** Every shape below `shapes`, depth first, each once. */
function allShapes(shapes: readonly ListShape[]): ListShape[] {
  const seen = new Set<ListShape>();
  const walk = (shape: ListShape): void => {
    if (seen.has(shape)) return;
    seen.add(shape);
    if ('lists' in shape) for (const child of shape.lists()) walk(child);
    if (shape.kind === 'parts') for (const child of shape.nested()) walk(child);
    if (shape.kind === 'kinds') {
      for (const kind of shape.kinds) {
        if ('lists' in kind) for (const child of kind.lists()) walk(child);
      }
    }
  };
  for (const shape of shapes) walk(shape);
  return [...seen];
}

/** A member of a value outside the type system (a fixture's reading), or none. */
function memberOf(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

/** Each list and kind of `shapes` the reading reaches: `list` or `list/kind`. */
function reached(shapes: readonly ListShape[], reading: unknown): Set<string> {
  const found = new Set<string>();
  const visit = (shape: ListShape, holder: unknown, depth: number): void => {
    if (depth > 64) return;
    const value = memberOf(holder, shape.list);
    const items: unknown[] = Array.isArray(value)
      ? value
      : value !== undefined && typeof value === 'object'
        ? [value]
        : [];
    if (items.length === 0) return;
    found.add(shape.list);
    for (const item of items) {
      if (shape.kind === 'kinds') {
        const kind = String(memberOf(item, shape.discriminant));
        found.add(`${shape.list}/${kind}`);
        for (const spec of shape.kinds) {
          if (spec.kind === kind && 'lists' in spec) {
            for (const child of spec.lists()) visit(child, item, depth + 1);
          }
        }
      } else if (shape.kind === 'parts') {
        const value =
          shape.member === undefined ? item : memberOf(item, shape.member);
        for (const child of shape.nested()) visit(child, value, depth + 1);
      } else if ('lists' in shape) {
        for (const child of shape.lists()) visit(child, item, depth + 1);
      }
    }
  };
  for (const shape of shapes) visit(shape, reading, 0);
  return found;
}

/**
 * Where every array of a JSON answer sits, as a path: `objects` at the root,
 * `objects[].children` inside each entry, `tree.children` inside a member.
 */
function arrayPaths(
  value: unknown,
  at = '',
  out = new Set<string>(),
): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) arrayPaths(item, `${at}[]`, out);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, member] of Object.entries(value)) {
      const path = at === '' ? key : `${at}.${key}`;
      if (Array.isArray(member)) out.add(path);
      arrayPaths(member, path, out);
    }
  }
  return out;
}

/** The paths the medium schemas declare, each with its shape. */
function declaredPaths(
  shapes: readonly ListShape[],
  at = '',
  out = new Map<string, ListShape>(),
  seen = new Set<ListShape>(),
): Map<string, ListShape> {
  for (const shape of shapes) {
    if (!('as' in shape)) continue;
    const path = at === '' ? shape.as : `${at}.${shape.as}`;
    if (shape.kind !== 'member') out.set(path, shape);
    if (seen.has(shape)) continue;
    seen.add(shape);
    if ('lists' in shape) {
      declaredPaths(
        shape.lists(),
        shape.kind === 'member' ? path : `${path}[]`,
        out,
        seen,
      );
    }
  }
  return out;
}

/** What breaks the tie, in words; none when the Returns and the fixtures agree. */
export function tieFaults(tie: ReturnsTie): string[] {
  const faults: string[] = [];
  const terse = allShapes(tie.terse);
  const facts = new Set(tie.returns.map((each) => each.text));
  if (facts.size !== tie.returns.length) {
    faults.push('a fact stated twice');
  }
  const generated = new Set(
    // The terse lists alone are stated: what only medium adds is not.
    returnsOf({
      heads: tie.heads,
      of: tie.of,
      by: tie.by,
      shapes: [tie.terse],
    }).map((each) => each.text),
  );
  for (const fact of facts) {
    if (!generated.has(fact)) faults.push(`an extra fact: "${fact}"`);
  }
  for (const fact of generated) {
    if (!facts.has(fact)) faults.push(`a fact left out: "${fact}"`);
  }
  const text = [...facts].join(' ').toLowerCase();
  // A subject merged with others reads `for each a and each b`: `for each b`
  // is then stated as `each b`.
  const stated = (noun: string): boolean =>
    text.includes(noun) ||
    (noun.startsWith('for each ') && text.includes(noun.slice('for '.length)));
  const named = (noun: string | undefined, what: string) => {
    if (noun === undefined) faults.push(`${what} is written without its noun`);
    else if (!stated(noun.toLowerCase())) {
      faults.push(
        `${what} is written, its noun "${noun}" is not in the Returns`,
      );
    }
  };
  // Every header, head and mark a terse listing writes, declared and named.
  const headers = new Map<string, readonly (string | undefined)[]>();
  const marks = new Map<string, string | undefined>();
  const heads = new Map<string, string | undefined>(
    tie.heads.map((head) => [head.label, head.about]),
  );
  for (const shape of terse) {
    if (shape.kind === 'rows' || shape.kind === 'node') {
      headers.set(shape.columns.join('\t'), shape.means);
      for (const label of shape.heads) heads.set(label, shape.about);
    }
    if (shape.kind === 'marks' || shape.kind === 'whole-marks') {
      marks.set(shape.mark, shape.about);
    }
    if (shape.kind === 'kinds') {
      for (const kind of shape.kinds) {
        if ('row' in kind) headers.set(kind.row.join('\t'), kind.means);
        if ('mark' in kind) marks.set(kind.mark, shape.about);
      }
      if (shape.header !== undefined) {
        const row = shape.kinds.find((kind) => 'row' in kind);
        headers.set(
          shape.header.join('\t'),
          row !== undefined && 'means' in row ? row.means : [],
        );
      }
    }
  }
  const reach = new Set<string>();
  const writtenHeads = new Set<string>();
  const mediumReach = new Set<string>();
  for (const sample of tie.samples) {
    for (const line of sample.lines) {
      if ('head' in line) writtenHeads.add(line.head);
      lineFaults(line, headers, heads, marks, named, faults);
    }
    for (const each of reached(tie.terse, sample.reading)) {
      reach.add(each);
    }
    if (sample.medium !== undefined) {
      const declared = declaredPaths(tie.medium ?? []);
      for (const path of arrayPaths(sample.medium)) {
        const shape = declared.get(path);
        if (shape === undefined) {
          faults.push(`the medium list "${path}" is under no declared name`);
        } else {
          named(shape.about, `the medium list "${path}"`);
          mediumReach.add(path);
        }
      }
    }
  }
  // Every column of every row a fixture reaches has its noun, a headerless
  // kind row's too (no header line shows its columns).
  for (const shape of terse) {
    if (!reach.has(shape.list)) continue;
    if (shape.kind === 'rows' || shape.kind === 'node') {
      shape.columns.forEach((column, i) => {
        if (shape.means[i] === undefined) {
          faults.push(`the column "${column}" has no noun`);
        }
      });
    }
    if (shape.kind === 'kinds') {
      for (const kind of shape.kinds) {
        if (!('row' in kind) || !reach.has(`${shape.list}/${kind.kind}`)) {
          continue;
        }
        kind.row.forEach((column, i) => {
          if (kind.means[i] === undefined) {
            faults.push(
              `the column "${column}" of the kind "${kind.kind}" has no noun`,
            );
          }
        });
      }
    }
  }
  for (const shape of terse) {
    // A part's tree root has no list of its own: its part reaches it.
    if (shape.list === '') continue;
    if (!reach.has(shape.list)) {
      faults.push(`no fixture reaches the list "${shape.list}"`);
    }
    if (shape.kind === 'kinds') {
      for (const kind of shape.kinds) {
        if (!reach.has(`${shape.list}/${kind.kind}`)) {
          faults.push(
            `no fixture reaches the kind "${shape.list}/${kind.kind}"`,
          );
        }
      }
    }
  }
  // Every declared head written by some fixture: the Returns names no head
  // the writer does not write.
  for (const head of tie.heads) {
    if (!writtenHeads.has(head.label)) {
      faults.push(`no fixture writes the head "${head.label}"`);
    }
  }
  // Every declared medium list reached by some fixture's medium answer.
  if (tie.samples.some((sample) => sample.medium !== undefined)) {
    for (const path of declaredPaths(tie.medium ?? []).keys()) {
      if (!mediumReach.has(path)) {
        faults.push(`no fixture reaches the medium list "${path}"`);
      }
    }
  }
  return [...new Set(faults)];
}

/** What one written line breaks: an undeclared header, head or mark, or one without its noun. */
function lineFaults(
  line: Line,
  headers: ReadonlyMap<string, readonly (string | undefined)[]>,
  heads: ReadonlyMap<string, string | undefined>,
  marks: ReadonlyMap<string, string | undefined>,
  named: (noun: string | undefined, what: string) => void,
  faults: string[],
): void {
  if ('header' in line) {
    const key = line.header.join('\t');
    const means = headers.get(key);
    if (means === undefined) {
      faults.push(`an undeclared header: "${key}"`);
      return;
    }
    line.header.forEach((column, i) => {
      named(means[i], `the column "${column}"`);
    });
  } else if ('head' in line) {
    if (!heads.has(line.head)) {
      faults.push(`an undeclared head: "${line.head}"`);
    } else named(heads.get(line.head), `the head "${line.head}"`);
  } else if ('group' in line) {
    if (!heads.has(line.group)) {
      faults.push(`an undeclared group: "${line.group}"`);
    } else named(heads.get(line.group), `the group "${line.group}"`);
  } else if ('mark' in line) {
    if (!marks.has(line.mark)) {
      faults.push(`an undeclared mark: "${line.mark}"`);
    } else named(marks.get(line.mark), `the mark "${line.mark}"`);
  }
}
