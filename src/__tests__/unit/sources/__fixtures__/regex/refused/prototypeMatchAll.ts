// `matchAll` read off `String.prototype`.
export const all = (value: string, pattern: Parameters<string['matchAll']>[0]) =>
  String.prototype.matchAll.call(value, pattern);
