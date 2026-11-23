/**
 * Plan step 10.5: a tool's Returns and what its writer writes, tied. Each
 * column a terse text writes (its header), each mark line and each head is
 * declared in the tool's schemas with its domain noun; the noun of every one
 * written is in the Returns, and the Returns names no noun whose column,
 * mark or head none of the texts writes.
 */

import type { ReturnsFact } from '../../../lib/description';
import type { ListShape } from '../../../lib/detail';

/** What one tool's tie is checked over. */
export interface ReturnsTie {
  /** Every shape of the tool's schemas, terse's. */
  readonly shapes: readonly ListShape[];
  /** Each head label the tool writes, with its domain noun. */
  readonly heads: Readonly<Record<string, string>>;
  readonly returns: readonly ReturnsFact[];
  /** The terse texts its fixtures wrote. */
  readonly texts: readonly string[];
}

/** One name the writer may write, with the noun the description names it by. */
interface Declared {
  readonly kind: 'column' | 'mark' | 'head';
  readonly name: string;
  readonly noun: string | undefined;
}

/** Every column, mark and list of the shapes, depth first, each shape once. */
function declaredOf(shapes: readonly ListShape[]): Declared[] {
  const seen = new Set<ListShape>();
  const walk = (shape: ListShape): Declared[] => {
    if (seen.has(shape)) return [];
    seen.add(shape);
    switch (shape.kind) {
      case 'rows':
      case 'node':
        return [
          ...shape.columns.map(
            (name, i): Declared => ({
              kind: 'column',
              name,
              noun: shape.means[i],
            }),
          ),
          ...shape.lists().flatMap(walk),
        ];
      case 'marks':
      case 'whole-marks':
        return [{ kind: 'mark', name: shape.mark, noun: shape.about }];
      case 'bullets':
      case 'sections':
      case 'within':
      case 'entries':
      case 'member':
        return shape.lists().flatMap(walk);
      case 'kinds':
        return shape.kinds.flatMap((kind): Declared[] =>
          'mark' in kind
            ? [{ kind: 'mark', name: kind.mark, noun: shape.about }]
            : 'lists' in kind
              ? kind.lists().flatMap(walk)
              : [],
        );
      default:
        return [];
    }
  };
  return shapes.flatMap(walk);
}

/** The names a terse text wrote: header cells, mark labels, head labels. */
function writtenOf(text: string, declared: readonly Declared[]): Set<string> {
  const columns = new Set(
    declared.filter((d) => d.kind === 'column').map((d) => d.name),
  );
  const written = new Set<string>();
  for (const line of text.split('\n')) {
    if (line.startsWith('# ')) {
      const label = line.slice(2).split('\t')[0]?.split(' ')[0] ?? '';
      written.add(label);
      continue;
    }
    const cells = line.split('\t');
    // A header: every cell a declared column's name.
    if (cells.length > 0 && cells.every((cell) => columns.has(cell))) {
      for (const cell of cells) written.add(cell);
    }
  }
  return written;
}

/** What breaks the tie, in words; none when the Returns and the texts agree. */
export function tieFaults(tie: ReturnsTie): string[] {
  const declared = [
    ...declaredOf(tie.shapes),
    ...Object.entries(tie.heads).map(
      ([name, noun]): Declared => ({ kind: 'head', name, noun }),
    ),
  ];
  const facts = tie.returns.map((each) => each.text.toLowerCase()).join(' ');
  const written = new Set<string>();
  for (const text of tie.texts) {
    for (const name of writtenOf(text, declared)) written.add(name);
  }
  const faults: string[] = [];
  for (const name of written) {
    const own = declared.filter((d) => d.name === name);
    if (own.length === 0) {
      faults.push(`"${name}" is written, and no schema declares it`);
      continue;
    }
    for (const each of own) {
      if (each.noun === undefined) {
        faults.push(`the ${each.kind} "${name}" is written without its noun`);
      } else if (!facts.includes(each.noun.toLowerCase())) {
        faults.push(
          `the ${each.kind} "${name}" is written, its noun "${each.noun}" is not in the Returns`,
        );
      }
    }
  }
  for (const each of declared) {
    if (
      each.noun !== undefined &&
      facts.includes(each.noun.toLowerCase()) &&
      !written.has(each.name)
    ) {
      faults.push(
        `the Returns names "${each.noun}", and no text writes the ${each.kind} "${each.name}"`,
      );
    }
  }
  return faults;
}
