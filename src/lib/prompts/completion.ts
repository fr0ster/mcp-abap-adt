/** Completion of a prompt argument from a closed set. */

/** The values starting with what the user typed, compared without regard to case. */
export function completeFrom(
  values: readonly string[],
  typed: string,
): string[] {
  const prefix = typed.toLowerCase();
  return values.filter((value) => value.toLowerCase().startsWith(prefix));
}
