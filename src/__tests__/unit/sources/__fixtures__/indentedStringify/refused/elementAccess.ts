export function answer(payload: object, space: number): string {
  return JSON['stringify'](payload, null, space);
}
