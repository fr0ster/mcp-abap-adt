// The closed rule, calls: a call or a `new` whose signature a declaration
// outside the repository writes to answer `unknown` or `any` is read only
// at a boundary — inside a listed function, whole into a sink, keys alone.
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';

// Refused: the answer is kept, read, or inspected.
export function kept(text: string): boolean {
  const value = JSON.parse(text);
  return value !== null;
}

export function read(box: IAbapRequestOptions): number {
  return Object.entries(box).length;
}

export function inspected(box: IAbapRequestOptions): boolean {
  return Reflect.get(box, 'data') === undefined;
}

// Passes: whole into a sink, keys alone, awaited into a sink.
export function passedOn(text: string): string {
  const keys = Object.keys(JSON.parse(text)).length;
  return `${JSON.stringify(JSON.parse(text))}${keys}`;
}

export async function awaitedOn(answer: Response): Promise<string> {
  return JSON.stringify(await answer.json());
}

// Inside a listed parse function: read there.
export function parseText(text: string): boolean {
  return typeof JSON.parse(text) === 'object';
}

// Its instantiation's `unknown`, brought in by an argument of ours: charged
// where that argument is.
export function broughtIn(values: Map<string, unknown>): number {
  return [...values.values()].length;
}
