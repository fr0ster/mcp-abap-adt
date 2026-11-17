// The angle-bracket spelling of a type assertion.
export function lengthOf(value: unknown): number {
  return (<string>value).length;
}
