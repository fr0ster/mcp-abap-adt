/**
 * Fixture for detailSurface.test.ts.
 *
 * The tool's schema declares `detail` and answers through the debugger's
 * adapter, but hands it a context of its own instead of the tool's
 * arguments: the level is fixed whatever the caller asked. Must produce
 * exactly one offender.
 */
declare const DETAIL_PROPERTY: Record<string, unknown>;
declare function debugAnswer(
  args: unknown,
  work: () => Promise<unknown>,
  terse: (v: unknown) => unknown,
): Promise<unknown>;

export const TOOL_DEFINITION = {
  name: 'FixtureDebugFixedLevel',
  inputSchema: {
    type: 'object',
    properties: {
      ...DETAIL_PROPERTY,
    },
  },
};

export async function handleFixture(_context: unknown, _args: unknown) {
  return debugAnswer(
    { detail: 'raw' },
    async () => ({ value: 1, raw: '1' }),
    (v) => v,
  );
}
