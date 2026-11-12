export function wrong(): number {
  // @ts-expect-error
  return 'not a number';
}
