export function run(work: () => void): string {
  try {
    work();
    return 'ok';
  } catch (caught) {
    const { message } = caught as Error;
    return message;
  }
}
