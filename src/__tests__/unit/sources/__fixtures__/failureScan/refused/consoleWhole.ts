export function run(work: () => void): void {
  try {
    work();
  } catch (caught) {
    console.error('[x] stack:', caught);
  }
}
