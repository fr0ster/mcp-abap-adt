// A type assertion: the compiler takes the author's word for the type.
export function lengthOf(value: unknown): number {
  return (value as string).length;
}
