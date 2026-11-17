// `as unknown as`: the double assertion `tsc` accepts between any two types.
export function count(value: string): number {
  return value as unknown as number;
}
