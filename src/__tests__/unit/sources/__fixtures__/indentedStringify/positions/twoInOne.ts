export function answer(payload: object): string {
  return JSON.stringify(payload, null, 2) + JSON.stringify(payload, null, 4);
}
