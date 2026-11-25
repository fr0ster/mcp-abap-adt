export function answer(payload: object): string {
  return JSON.stringify(payload, null, 2);
}
