export function run(work: () => void): void {
  try {
    work();
  } catch (caught) {
    process.stderr.write(caught as string);
  }
}
