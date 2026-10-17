export function run(work: () => void): void {
  try {
    work();
  } catch (caught) {
    process.stderr.write(`[x] failed: ${caught}\n`);
  }
}
