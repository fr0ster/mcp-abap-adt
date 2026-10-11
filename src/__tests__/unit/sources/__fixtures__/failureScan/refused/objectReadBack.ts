export function run(work: () => void): string {
  try {
    work();
    return '';
  } catch (caught) {
    const held = { e: caught as Error }.e;
    return held.message;
  }
}
