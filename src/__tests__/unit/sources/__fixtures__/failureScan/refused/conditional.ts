export function run(work: () => void, fallback: Error): string {
  try {
    work();
    return '';
  } catch (caught) {
    const chosen = caught instanceof Error ? caught : fallback;
    return chosen.message;
  }
}
