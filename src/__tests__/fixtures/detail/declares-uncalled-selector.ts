/**
 * Fixture for detailSurface.test.ts.
 *
 * The schema declares `detail`, and a selector by the level asked for —
 * `readingAt(TABLE, levelOf(args))` — sits in the file, in a function no
 * path calls; the request is read at a fixed level. The selector does not
 * excuse it. Must produce exactly one offender.
 */
declare const DETAIL_PROPERTY: Record<string, unknown>;
declare function detailOf(args: unknown): 'terse' | 'full' | 'raw';
declare function levelOf(args: unknown): 'terse' | 'medium' | 'full' | 'raw';
declare function readingAt(table: unknown, level: unknown): unknown;
declare function answer(
  ctx: unknown,
  call: () => unknown,
  project: (value: unknown) => unknown,
): unknown;
declare const TABLE: unknown;
declare function read(reading: unknown): unknown;

export const TOOL_DEFINITION = {
  name: 'FixtureUncalledSelector',
  inputSchema: {
    type: 'object',
    properties: {
      ...DETAIL_PROPERTY,
    },
  },
};

export function handleFixture(args: unknown) {
  const detail = detailOf(args);
  return answer(
    { tool: 'FixtureUncalledSelector', detail },
    () => read(readingAt(TABLE, 'terse')),
    (value) => value,
  );
}

export function uncalledSelector(args: unknown) {
  return readingAt(TABLE, levelOf(args));
}
