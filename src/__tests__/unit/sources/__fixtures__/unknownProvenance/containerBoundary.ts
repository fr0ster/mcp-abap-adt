// Containers of `unknown` fed only from outside the type system: parsed text
// and a caught value. Each passes, as a plain `unknown` would.
function countAll(items: readonly unknown[]): number {
  return items.length;
}
export function fromText(text: string): number {
  const parsed: unknown = JSON.parse(text);
  return countAll(Array.isArray(parsed) ? parsed : []);
}

function keysOf(bag: Record<string, unknown>): string[] {
  return Object.keys(bag);
}
export function fromCaught(work: () => void): string[] {
  try {
    work();
    return [];
  } catch (error) {
    return keysOf({ error });
  }
}

function made(make: () => unknown): boolean {
  return make() !== null;
}
export function fromParse(text: string): boolean {
  return made(() => JSON.parse(text));
}

function each(visit: (visited: unknown) => void, text: string): void {
  visit(JSON.parse(text));
}
export function fromVisitor(text: string): void {
  each((visited) => void String(visited), text);
}
