// Round 9: a third party's `unknown` member a typed value is put into is
// read back however it is read: by name, by a literal key, by destructuring
// (renamed, with a default, nested, in a parameter, in an assignment, by a
// rest), each refused where it reads. A read whose value only passes on
// (where `unknown` or `any` is expected, or inspected) reads nothing back.
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';

export function built(body: string): IAbapRequestOptions {
  return { url: '/x', method: 'POST', timeout: 1, data: body };
}

export function byName(options: IAbapRequestOptions): boolean {
  const body = options.data;
  return body !== undefined;
}

export function byKey(options: IAbapRequestOptions): boolean {
  const body = options['data'];
  return body !== undefined;
}

export function renamed(options: IAbapRequestOptions): boolean {
  const { data: body } = options;
  return body !== undefined;
}

export function withDefault(options: IAbapRequestOptions): boolean {
  const { data = 'none' } = options;
  return data !== undefined;
}

export function nested(holder: { options: IAbapRequestOptions }): boolean {
  const {
    options: { data },
  } = holder;
  return data !== undefined;
}

export function inParameter({ data }: IAbapRequestOptions): boolean {
  return data !== undefined;
}

export function assigned(options: IAbapRequestOptions): boolean {
  let body: string | undefined;
  ({ url: body } = options);
  let held;
  ({ data: held } = options);
  return held !== undefined && body !== undefined;
}

export function rest(options: IAbapRequestOptions): number {
  const { url, ...others } = options;
  return url.length + Object.keys(others).length;
}

// Passed on, or only inspected: no read-back.
export function passedOn(options: IAbapRequestOptions): string {
  return options.data === undefined ? '' : JSON.stringify(options['data']);
}

// Members no typed value was put into: no read-back.
export function urlOf(options: IAbapRequestOptions): string {
  const { url } = options;
  return `${url}${options.method}`;
}
