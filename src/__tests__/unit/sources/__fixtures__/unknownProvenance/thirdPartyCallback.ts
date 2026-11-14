// The closed rule, callbacks: a parameter of ours a contract outside the
// repository hands its own `unknown` or `any` is read there — refused
// unless every use passes it on whole, or it is inside a listed function.
// An `unknown` of a type of ours the contract was instantiated with is ours.
export interface Reading<T> {
  readonly value: T;
}

export function inspects(text: string): string {
  return JSON.stringify(
    JSON.parse(text, (_key: string, value: unknown) =>
      typeof value === 'string' ? value.trim() : value,
    ),
  );
}

export function listed(raw: unknown): boolean {
  return Array.isArray(raw) && raw.every((entry: unknown) => entry !== null);
}

export function readByPredicate(raw: unknown): boolean {
  return Array.isArray(raw) && raw.every((entry: unknown) => entry !== null);
}

// Passes: every use hands it on whole.
export function handsOn(text: string): string {
  return JSON.stringify(
    JSON.parse(text, (_key: string, value: unknown) => value),
  );
}

// Passes: a callback typed by our own instantiation.
export function ours(read: Promise<Reading<unknown>>): Promise<string> {
  return read.then((reading: Reading<unknown>) => String(reading.value));
}
