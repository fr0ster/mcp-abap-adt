// A property read of a thrown value: whatever its declared type says after
// the narrowing, the value comes from outside the type system.
function classOf(error: unknown): string {
  if (error instanceof Error) {
    const name: unknown = error.constructor.name;
    return typeof name === 'string' ? name : 'Error';
  }
  return typeof error;
}

export function run(): string {
  try {
    return String(JSON.parse('{'));
  } catch (caught) {
    return classOf(caught);
  }
}
