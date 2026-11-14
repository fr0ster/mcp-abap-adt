// Round 10: a value whose type holds a third party's `unknown` member a typed
// value is put into is read back whole by the language's reflective and
// whole-object reads as surely as by name: each is refused where it reads.
// A `for … in` reads keys alone; a spread copy keeps the member's
// declaration, so a read of the copy's member is the read-back.
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';

export function built(body: string): IAbapRequestOptions {
  return { url: '/x', method: 'POST', timeout: 1, data: body };
}

export function entries(box: IAbapRequestOptions): number {
  return Object.entries(box).length;
}

export function values(box: IAbapRequestOptions): number {
  return Object.values(box).length;
}

export function reflected(box: IAbapRequestOptions): boolean {
  const body = Reflect.get(box, 'data');
  return body !== undefined;
}

export function descriptors(box: IAbapRequestOptions): number {
  const one = Object.getOwnPropertyDescriptor(box, 'data');
  return Object.keys(Object.getOwnPropertyDescriptors(box)).length + (one ? 1 : 0);
}

export function assigned(box: IAbapRequestOptions): string {
  const target: { url: string; data?: string } = { url: '' };
  return Object.assign(target, box).url;
}

export function cloned(box: IAbapRequestOptions): number {
  return structuredClone(box).url.length;
}

export function spreadCopy(box: IAbapRequestOptions): boolean {
  const copy = { ...box, url: '' };
  const body = copy.data;
  return body !== undefined;
}

// Keys alone, a value whose type holds no such member, or a whole value
// that passes on: nothing is read back.
export function forIn(box: IAbapRequestOptions): number {
  let count = 0;
  for (const key in box) count += key.length;
  return count;
}

export function plain(box: { url: string }): number {
  return Object.entries(box).length + Object.values(box).length;
}

export function serialized(box: IAbapRequestOptions): string {
  return JSON.stringify(Object.entries(box));
}
