// A test helper holding `any`: refused under `any`, as test infrastructure.
export function loosely(value: any): string {
  return String(value);
}
