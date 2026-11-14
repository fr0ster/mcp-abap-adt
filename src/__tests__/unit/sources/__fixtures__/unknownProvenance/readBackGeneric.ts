// Round 10: a third party's `unknown` member a typed value is put into,
// read back by being handed to a generic function of ours: its type
// parameter instantiated to `unknown` is no sink — the function narrows and
// uses the value — so the read is refused. Handed to a parameter declared
// `unknown` or `any` (a third party's sink, `JSON.stringify`), it passes on.
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';

export function built(body: string): IAbapRequestOptions {
  return { url: '/x', method: 'POST', timeout: 1, data: body };
}

function consume<T>(value: T): string {
  return typeof value === 'string' ? value.toUpperCase() : '';
}

function consumeBox<T>(box: { value: T }): string {
  return typeof box.value === 'string' ? box.value : '';
}

export function handed(box: IAbapRequestOptions): string {
  return consume(box.data);
}

export function handedInLiteral(box: IAbapRequestOptions): string {
  return consumeBox({ value: box.data });
}

export function handedExplicitly(box: IAbapRequestOptions): string {
  return consume<unknown>(box.data);
}

// A sink declared to take anything: no read-back.
export function serialized(box: IAbapRequestOptions): string {
  return JSON.stringify(box.data);
}
