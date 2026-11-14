// Round 9: a container literal put where `unknown` is expected is a typed
// value, as a scalar is: an object, an array, nested, charged to its slot.
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';

function parse(value: unknown): boolean {
  return value !== null;
}

export const scalar = parse(1);
export const object = parse({ n: 1 });
export const array = parse([1]);
export const nestedLiteral = parse({ list: [{ n: 1 }] });
// An empty literal carries no type.
export const empty = parse({});

export function written(options: IAbapRequestOptions): boolean {
  options.params = { n: 1 };
  const held = options.params;
  return held !== undefined;
}
