// The type gate, `any` is an error: the keyword written, and every
// expression the checker types `any` — kept, read, inspected, handed into a
// narrower slot — unless it is handed on whole into a slot declared
// `unknown` or `any`.
declare function consume(value: unknown): void;

// Error: the keyword written (its value handed on whole passes).
// biome-ignore lint/suspicious/noExplicitAny: the gate's own fixture.
export function written(value: any): void {
  consume(value);
}

// Errors: kept, then handed into a narrower return.
export function kept(text: string): string {
  const parsed = JSON.parse(text);
  return parsed;
}

// Error: inspected.
export function inspected(text: string): boolean {
  return typeof JSON.parse(text) === 'object';
}

// Error: handed to a type parameter, a narrower slot.
export function laundered(text: string): Promise<string> {
  return Promise.resolve(JSON.parse(text));
}

// Error: an element of `Array.isArray`'s `any[]`, inspected.
export function element(raw: object): boolean {
  if (!Array.isArray(raw)) return false;
  return typeof raw[0] === 'string';
}

// Error: `Reflect.get`'s answer, compared.
export function reflected(box: object): boolean {
  return Reflect.get(box, 'x') === undefined;
}

// Passes: handed on whole into a slot declared `unknown` or `any`.
export function passed(text: string): string {
  consume(JSON.parse(text));
  const held: unknown = JSON.parse(text);
  consume(held);
  return JSON.stringify(JSON.parse(text));
}

export function returned(text: string): unknown {
  return JSON.parse(text);
}

// Passes: returned from a function its contract declares returning `any`
// (`ProxyHandler.get`).
export const proxied = new Proxy(
  {},
  { get: (target, property) => Reflect.get(target, property) },
);

// Error: returned from an async function into its `Promise<unknown>`.
export async function awaited(text: string): Promise<unknown> {
  return JSON.parse(text);
}

// Error: a declaration whose type merely holds a sink contract somewhere
// exempts nothing inside it.
interface ILogger {
  info(message: string, meta?: unknown): void;
}
export const disguised: { sink?: ILogger; answer: boolean } = {
  answer: typeof JSON.parse('0') === 'string',
};
