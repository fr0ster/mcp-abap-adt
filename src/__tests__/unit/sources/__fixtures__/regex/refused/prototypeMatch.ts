// `match` called on `String.prototype` itself, its pattern a variable.
export function compile(pattern: string) {
  return String.prototype.match(pattern);
}
