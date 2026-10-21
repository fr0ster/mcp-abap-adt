export function run(work: () => void): string {
  try {
    work();
    return 'ok';
  } catch (caught) {
    return String(caught);
  }
}
