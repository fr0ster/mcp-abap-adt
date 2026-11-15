// The closed rule, callbacks typed by the contract: a parameter written
// without a type takes the contract's own `unknown` or `any` (a reviver's
// value) and is judged exactly as one written with it — refused unless
// every use hands it on whole.

// Refused: inspected, discarded, tested on the way.
export function inspects(text: string): string {
  return JSON.stringify(
    JSON.parse(text, (_key, value) =>
      typeof value === 'string' ? 'text' : 'other',
    ),
  );
}

export function tested(text: string): string {
  return JSON.stringify(JSON.parse(text, (_key, value) => value ?? null));
}

// Passes: every use hands it on whole.
export function handsOn(text: string): string {
  return JSON.stringify(JSON.parse(text, (_key, value) => value));
}

// Passes: a function the contract hands is called — its parameter's `any`
// is written into, not read.
export function settles(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (resolve.length > 1) reject(new Error('late'));
    resolve('done');
  });
}

// Ours: a contract instantiated with a type we wrote is bound by us.
type ToolArgs = Readonly<Record<string, unknown>>;

export function ours(list: readonly ToolArgs[]): number {
  return list.filter((entry) => entry.name !== undefined).length;
}
