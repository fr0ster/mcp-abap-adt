// The closed rule sees every declaration of a member: a typed member of
// ours beside a third party's `unknown` one (an intersection, an
// `Object.assign` of theirs into ours, a spread copy) still reads theirs,
// though the checker reduces `string & unknown` to `string`.
import type { IAbapRequestOptions } from '@mcp-abap-adt/interfaces-adt-connection';

export function assigned(box: IAbapRequestOptions): number {
  const target: { url: string; data?: string } = { url: '' };
  return Object.assign(target, box).data?.length ?? 0;
}

export function intersected(box: IAbapRequestOptions & { data: string }): number {
  return box.data.length;
}

export function spread(box: IAbapRequestOptions): boolean {
  const copy = { ...box, url: '' };
  return copy.data === undefined;
}

// A member typed alike on both sides reads nothing of theirs.
export function typedAlike(box: IAbapRequestOptions): number {
  const target: { url: string } = { url: '' };
  return Object.assign(target, box).url.length;
}
