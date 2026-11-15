// The closed rule, provenance: an `unknown` is ours only when text we wrote
// binds it — a type argument written at the call or the `new`, an annotation
// of ours whose type holds it, a contract the repository declares. One
// inferred from a third party's value or default, or held by a binding with
// no written type over one, is the third party's.
import type { Readable } from 'node:stream';
import {
  defaultSubscribe,
  type Generic,
  Holder,
  iterable,
  makeGeneric,
  raw,
  specialised,
} from './node_modules/external-contracts';

type ToolArgs = Readonly<Record<string, unknown>>;

function identity<T>(value: T): T {
  return value;
}

// Refused: a receiver whose type argument nothing here wrote.
export function receivers(): void {
  const mine = specialised;
  mine.subscribe((value) => String(typeof value === 'string'));
  identity(specialised).subscribe((value) => String(typeof value === 'string'));
  makeGeneric().subscribe((value) => String(typeof value === 'string'));
  new Holder().subscribe((value) => String(typeof value === 'string'));
  let later = makeGeneric();
  later = specialised;
  later.subscribe((value) => String(typeof value === 'string'));
}

// Refused: a third party's default type argument.
export function defaulted(): void {
  defaultSubscribe((value) => String(typeof value === 'string'));
}

// Refused: a shorthand property of a third party's value.
export function shorthand(): boolean {
  const box = { raw };
  return typeof box.raw === 'string';
}

// Refused: bindings with no written type over a third party's values.
export async function bindings(stream: Readable): Promise<string> {
  let seen = '';
  for await (const chunk of stream) seen += String(typeof chunk === 'string');
  for (const item of iterable) seen += String(typeof item === 'string');
  const [first] = iterable;
  const [second = 'none'] = iterable;
  return `${seen}${String(typeof first === 'string')}${String(second === 'none')}`;
}

// Passes: ours — a type argument written here, an annotation of ours, a
// value inferred from one.
export function ours(mine: Generic<ToolArgs>, list: readonly ToolArgs[]): string {
  let seen = '';
  new Holder<ToolArgs>().subscribe((value) => {
    seen += String(value.name !== undefined);
  });
  mine.subscribe((value) => {
    seen += String(value.name !== undefined);
  });
  const copy = mine;
  copy.subscribe((value) => {
    seen += String(value.name !== undefined);
  });
  identity(mine).subscribe((value) => {
    seen += String(value.name !== undefined);
  });
  for (const entry of list) seen += String(entry.name !== undefined);
  const [one] = list;
  return `${seen}${String(one?.name !== undefined)}`;
}

// Refused: a binding of ours reassigned from a third party's default.
export function reassigned(): void {
  let swapped = new Holder<ToolArgs>();
  swapped = new Holder();
  swapped.subscribe((value) => String(value.name !== undefined));
}

// Ours: a member the repository declares, destructured.
interface Rejection {
  readonly error: unknown;
}

export function destructured(rejected: Rejection): string {
  const { error } = rejected;
  return String(error === undefined);
}
