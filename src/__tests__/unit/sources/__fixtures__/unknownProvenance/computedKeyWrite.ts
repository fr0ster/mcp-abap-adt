// Round 10: a typed value written into a third party's `unknown` member by a
// computed key is charged to the member the key's literal type names (each
// member of a union of literals), so a later read of that member is a
// read-back.
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';

export function written(box: IAbapRequestOptions): boolean {
  const key = 'data';
  box[key] = 'value';
  const body = box.data;
  return body !== undefined;
}

export function writtenByUnion(
  box: IAbapRequestOptions,
  key: 'data' | 'params',
): boolean {
  box[key] = 'value';
  const params = box.params;
  return params !== undefined;
}
