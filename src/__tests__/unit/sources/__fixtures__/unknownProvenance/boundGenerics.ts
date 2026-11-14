// Bound by the caller: a type parameter's constraint and default are not
// positions; each instantiation is judged where it is written.
export function atStep<A extends unknown[], T>(
  call: (...args: A) => T,
): (...args: A) => T {
  return call;
}

export const doubled = atStep((n: number) => n * 2);

export class Session<O = unknown> {
  origin?: O;
}

// Bound by the caller: passes.
export const bound = new Session<string>();

// An instantiation through the default: refused where it is written.
export const defaulted = new Session();
