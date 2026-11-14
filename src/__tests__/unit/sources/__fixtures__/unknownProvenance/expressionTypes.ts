// Round 9: a type written inside an expression is ours, as a declaration's
// written type is: each `unknown` it holds is refused where it is written.
import type { IResultStrategy } from '@mcp-abap-adt/interfaces-adt';

function consume<T>(_value: T): void {}

function tagged<T>(_parts: TemplateStringsArray, ..._values: T[]): string {
  return '';
}

class Recorder<T> {
  record(_value: T): void {}
}

// `satisfies` writes its type.
export const table = {} satisfies Record<string, IResultStrategy<unknown>>;

// A call's explicit type argument, the call answering `void`.
consume<unknown>(1);

// A tagged template's.
export const line = tagged<unknown>`a${1}`;

// A `new`'s: charged once, at the instantiation.
export const recorder = new Recorder<unknown>();

// An instantiation expression's.
export const instantiated = consume<unknown>;

// A type assertion's.
export const asserted = 1 as unknown as number;

// Typed, and `as const`: pass.
consume<number>(1);
export const typed = {} satisfies Record<string, IResultStrategy<string>>;
export const constant = [1] as const;
