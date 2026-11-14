// Round 11: each form puts a typed value into a third
// party's unknown member and reads it back; under the closed rule each
// read is refused on its own, whatever was written.
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';
// The one accessor typed `any` among the installed dependencies' own
// typings: hono's, beside the MCP SDK.
import type { JSXNode } from '../../../../../../node_modules/@modelcontextprotocol/sdk/node_modules/hono/dist/types/jsx/base';

export function aliasDestructured(box: IAbapRequestOptions): number {
  box.data = 'v';
  const { entries } = Object;
  return entries(box).length;
}

export function aliasObject(box: IAbapRequestOptions): number {
  box.data = 'v';
  const O = Object;
  return O.entries(box).length;
}

export function aliasKey(box: IAbapRequestOptions): number {
  box.data = 'v';
  return Object['entries'](box).length;
}

function entriesOf<T extends object>(v: T) {
  return Object.entries(v);
}

export function wrapped(box: IAbapRequestOptions): number {
  box.data = 'v';
  return entriesOf(box).length;
}

export function mixedKey(box: IAbapRequestOptions, key: 'url' | 'data'): boolean {
  box[key] = 'v';
  const back = box.data;
  return back !== undefined;
}

export function assignWrite(box: IAbapRequestOptions): boolean {
  Object.assign(box, { data: 'v' });
  const back = box.data;
  return back !== undefined;
}

export function defineWrite(box: IAbapRequestOptions): boolean {
  Object.defineProperty(box, 'data', { value: 'v' });
  const back = box.data;
  return back !== undefined;
}

// Its getter has no setter: the read alone.
export function accessor(node: JSXNode): boolean {
  const back = node.ref;
  return back !== undefined;
}

// Typed alone, nothing third-party read: clean.
export function clean(box: IAbapRequestOptions): string {
  return box.url;
}
