export function run(work: () => void): unknown {
  try {
    work();
    return undefined;
  } catch (caught) {
    return (caught as Record<string, unknown>)['message'];
  }
}
