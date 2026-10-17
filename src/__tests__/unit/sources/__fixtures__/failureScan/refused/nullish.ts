export function run(work: () => void, fallback: Error): string {
  try {
    work();
    return '';
  } catch (caught) {
    const chosen = (caught as Error | undefined) ?? fallback;
    return chosen.message;
  }
}
