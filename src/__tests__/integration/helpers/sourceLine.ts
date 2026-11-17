/**
 * The line of a source, from 1, found by its text — a breakpoint's line in a
 * shared class as the system holds it. The same class is laid out differently
 * on different systems (measured: the shared run class's `out->write` is on
 * line 12 on premise and on line 16 on ABAP Cloud), so a line is read from the
 * source the system answers, never written into a test.
 *
 * A line matches when, trimmed and in lower case, it equals `text` (given in
 * lower case). None matching throws, naming the object and the text.
 *
 * Uses no test runner.
 */
export function lineOfText(
  source: string,
  text: string,
  objectName: string,
): number {
  const index = source
    .split('\n')
    .findIndex((line) => line.trim().toLowerCase() === text);
  if (index < 0) {
    throw new Error(`the shared class ${objectName} has no line "${text}"`);
  }
  return index + 1;
}
