export function run(work: () => void): string {
  try {
    work();
    return '';
  } catch (caught) {
    const [first] = [caught as Error];
    return first.message;
  }
}
