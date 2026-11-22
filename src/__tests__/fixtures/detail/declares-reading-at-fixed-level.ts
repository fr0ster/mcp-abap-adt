/**
 * Fixture for detailSurface.test.ts.
 *
 * The schema declares `detail`, but the handler reads its table at a fixed
 * level — `readingAt(TABLE, 'terse')` — and the projection names no level:
 * the tool advertises the parameter and ignores it. Must produce exactly one
 * offender.
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
  name: 'FixtureReadingAtFixedLevel',
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
    { tool: 'FixtureReadingAtFixedLevel', detail },
    () => read(readingAt(TABLE, 'terse')),
    (value) => value,
  );
}
