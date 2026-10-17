const messageOf = (e: unknown) => (e as Error).message;

export function run(work: () => void): string {
  try {
    work();
    return '';
  } catch (caught) {
    return messageOf(caught);
  }
}
