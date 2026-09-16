/**
 * Fixture for detailSurface.test.ts.
 *
 * The tool's schema declares `detail` (via `DETAIL_PROPERTY`), but the
 * `answer()` call's context object carries no `detail` property at all —
 * the handler never reads the parameter its own schema promises. Must
 * produce exactly one offender.
 */
declare const DETAIL_PROPERTY: Record<string, unknown>;
declare function answer(
  ctx: unknown,
  call: () => unknown,
  project: (value: unknown) => unknown,
): unknown;

export const TOOL_DEFINITION = {
  name: 'FixtureDeclaresPassesNone',
  inputSchema: {
    type: 'object',
    properties: {
      ...DETAIL_PROPERTY,
    },
  },
};

export function handleFixture() {
  return answer(
    { tool: 'FixtureDeclaresPassesNone' },
    () => undefined,
    (value: unknown) => value,
  );
}
