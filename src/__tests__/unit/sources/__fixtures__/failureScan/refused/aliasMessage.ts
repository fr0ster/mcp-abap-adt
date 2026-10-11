export function run(work: () => void): string {
  try {
    work();
    return 'ok';
  } catch (caught) {
    const alias = caught as Error;
    return alias.message;
  }
}
