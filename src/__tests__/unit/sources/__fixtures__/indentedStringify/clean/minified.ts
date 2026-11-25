export function answer(payload: object): string {
  const keys = (key: string, value: unknown) => (key === 'x' ? undefined : value);
  return JSON.stringify(payload) + JSON.stringify(payload, keys);
}
