export function run(work: () => void): string {
  try {
    work();
    return '';
  } catch (caught) {
    return 'failed: ' + caught;
  }
}
