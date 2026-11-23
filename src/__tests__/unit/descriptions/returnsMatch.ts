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
      } else if ('lists' in shape) {
        for (const child of shape.lists()) visit(child, item, depth + 1);
      }
    }
  };
  for (const shape of shapes) visit(shape, reading, 0);
  return found;
}

/** Every array-valued member name of a JSON answer, at any depth. */
function arrayMembers(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) arrayMembers(item, out);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, member] of Object.entries(value)) {
      if (Array.isArray(member)) out.add(key);
      arrayMembers(member, out);
    }
  }
  return out;
}

/** What breaks the tie, in words; none when the Returns and the fixtures agree. */
export function tieFaults(tie: ReturnsTie): string[] {
  const faults: string[] = [];
  const terse = allShapes(tie.terse);
  const medium = allShapes(tie.medium ?? []);
  const facts = new Set(tie.returns.map((each) => each.text));
  const generated = new Set(
    returnsOf({
      heads: tie.heads,
      shapes: [tie.terse, tie.medium ?? []],
    }).map((each) => each.text),
  );
  for (const fact of facts) {
    if (!generated.has(fact)) faults.push(`an extra fact: "${fact}"`);
  }
  for (const fact of generated) {
    if (!facts.has(fact)) faults.push(`a fact left out: "${fact}"`);
  }
  const text = [...facts].join(' ').toLowerCase();
  const named = (noun: string | undefined, what: string) => {
    if (noun === undefined) faults.push(`${what} is written without its noun`);
    else if (!text.includes(noun.toLowerCase())) {
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
  for (const sample of tie.samples) {
    for (const line of sample.lines) {
      lineFaults(line, headers, heads, marks, named, faults);
    }
    for (const each of reached(tie.terse, sample.reading)) {
      reach.add(each);
    }
    if (sample.medium !== undefined) {
      const declared = new Set(
        medium.map((shape) => ('as' in shape ? shape.as : shape.list)),
      );
      for (const name of arrayMembers(sample.medium)) {
        if (!declared.has(name)) {
          faults.push(`the medium list "${name}" is under no declared name`);
        }
      }
      for (const shape of medium) {
        if ('as' in shape && arrayMembers(sample.medium).has(shape.as)) {
          named(shape.about, `the medium list "${shape.as}"`);
        }
      }
    }
  }
  for (const shape of terse) {
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
