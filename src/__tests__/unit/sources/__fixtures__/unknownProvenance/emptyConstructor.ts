// Round 8: a value made by `new` with no arguments is typed by its class,
// not an empty container: its `number` lands where `unknown` is written.
class Source {
  value = 42;
}

export function made(): boolean {
  const held: { value: unknown } = new Source();
  return held.value !== null;
}
