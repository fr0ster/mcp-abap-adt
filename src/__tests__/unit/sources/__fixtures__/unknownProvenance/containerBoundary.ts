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

// A tuple's typed member written after it is made leaves its `unknown`
// member a boundary.
export function tupleMember(raw: string): number {
  const parsed: unknown = JSON.parse(raw);
  const member: [unknown, string] = [parsed, ''];
  member[1] = 'x';
  return member.length;
}

// A parameter before an array spread receives only what is written before
// it; a resolver shadowed in a nested function is another one.
function takeFirst(firstOnly: unknown, ...others: unknown[]): number {
  return others.length + (firstOnly === null ? 0 : 1);
}
export function beforeSpread(raw: string, typed: number): number {
  const parsed: unknown = JSON.parse(raw);
  const none: unknown[] = [];
  return takeFirst(parsed, ...none, typed);
}
export function shadowedResolver(raw: string): Promise<unknown> {
  const parsed: unknown = JSON.parse(raw);
  const awaited: Promise<unknown> = new Promise<unknown>((resolve) => {
    function other(resolve: (value: number) => void): void {
      resolve(1);
    }
    other(() => undefined);
    resolve(parsed);
  });
  return awaited;
}
