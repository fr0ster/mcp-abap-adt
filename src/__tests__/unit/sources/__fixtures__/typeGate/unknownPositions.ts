// The type gate, `unknown` written by us is a warning, in every type
// position: an alias, an interface's field, a parameter, a return, an
// annotation, a type argument, a constraint, a default, an `as` target.
export type Alias = unknown;

export interface Shape {
  readonly field: unknown;
}

export function parameter(value: unknown): string {
  return String(value);
}

export function returns(): unknown {
  return 1;
}

export const annotated: unknown = 1;

export const argument = new Map<string, unknown>();

export function constrained<T extends unknown>(value: T): T {
  return value;
}

export function defaulted<T = unknown>(value: T): T {
  return value;
}

export const asserted = 1 as unknown;
