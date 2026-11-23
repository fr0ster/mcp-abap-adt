/**
 * Fixture for detailSurface.test.ts.
 *
 * The schema declares `detail`, and the handler selects the reading the call
 * is given by the level asked for — `readingAt(TABLE, levelOf(args))` — so
 * the projection answers the reading's value and names no level itself.
 * Must produce no offender.
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
  name: 'FixtureReadingByLevel',
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
    { tool: 'FixtureReadingByLevel', detail },
    () => read(readingAt(TABLE, levelOf(args))),
    (value) => value,
  );
}
