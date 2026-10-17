export function run(work: () => void): string | undefined {
  try {
    work();
    return undefined;
  } catch (caught) {
    return (caught as Error).stack;
  }
}
