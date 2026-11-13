// `match` taken off a string and called through `call`: its argument is
// compiled as a regular expression all the same.
export const found = (
  value: string,
  pattern: Parameters<string['match']>[0],
) => value.match.call(value, pattern);
