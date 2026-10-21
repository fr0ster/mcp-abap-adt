export function run(work: () => void): string {
  try {
    work();
    return '';
  } catch (caught) {
    return (caught as Error).toString();
  }
}
