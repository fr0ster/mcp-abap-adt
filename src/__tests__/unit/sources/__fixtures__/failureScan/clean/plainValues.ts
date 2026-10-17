// `.message` and `.name` of values that were never thrown.
export function words(answer: { message: string; name: string }): string {
  return `${answer.name}: ${answer.message}`;
}
