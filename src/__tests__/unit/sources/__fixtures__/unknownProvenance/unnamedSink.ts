// An unnamed sink: a function of the repository that accepts anything, named by
// no contract of the sinks.
function show(value: unknown): string {
  return String(value);
}

export function run(): string {
  return show('order') + show(42);
}
