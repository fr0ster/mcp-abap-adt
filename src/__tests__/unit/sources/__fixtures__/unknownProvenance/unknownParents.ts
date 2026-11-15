// The closed rule's pass-on list is closed: a third party's `unknown` whose
// parent is a position the list does not name — a list's element kept, a
// template's span, a comma's left operand, a `throw`, a `yield` — is
// refused, wherever the result lands.
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';

export function parents(answer: IAdtWireResponse): string[] {
  const listed = String([answer.data].length);
  const spanned = `${answer.data}`;
  const comma = JSON.stringify((answer.data, 0));
  return [listed, spanned, comma];
}

export function thrown(answer: IAdtWireResponse): never {
  throw answer.data;
}

export function* yielded(answer: IAdtWireResponse): Generator<unknown> {
  yield answer.data;
}

// Passes: whole into a sink, a list literal landing there whole included.
export function sunk(answer: IAdtWireResponse): string {
  return JSON.stringify([answer.data]) + JSON.stringify(answer.data);
}
