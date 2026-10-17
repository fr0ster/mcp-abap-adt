export function run(work: () => void): string {
  try {
    work();
    return '';
  } catch (caught) {
    return JSON.stringify({ failed: true, error: caught });
  }
}
