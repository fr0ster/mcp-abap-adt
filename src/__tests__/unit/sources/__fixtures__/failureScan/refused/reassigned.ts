export function run(work: () => void): string {
  let last: unknown;
  try {
    work();
  } catch (caught) {
    last = caught;
  }
  return (last as Error | undefined)?.message ?? '';
}
