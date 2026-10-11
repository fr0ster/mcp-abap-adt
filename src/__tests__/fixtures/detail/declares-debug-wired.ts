/**
 * Fixture for detailSurface.test.ts.
 *
 * The tool's schema declares `detail` and hands the debugger's adapters its
 * own arguments, which is how they select terse, full or raw. Must produce no
 * offender.
 */
declare const DETAIL_PROPERTY: Record<string, unknown>;
declare function debugAnswer(
  args: unknown,
  work: () => Promise<unknown>,
  terse: (v: unknown) => unknown,
): Promise<unknown>;
declare function debugStateAnswer(
  args: unknown,
  work: () => Promise<unknown>,
): Promise<unknown>;

export const TOOL_DEFINITION = {
  name: 'FixtureDebugWired',
  inputSchema: {
    type: 'object',
    properties: {
      ...DETAIL_PROPERTY,
    },
  },
};

export async function handleFixture(_context: unknown, args: unknown) {
  if (args === null) {
    return debugStateAnswer(args, async () => ({ state: 'ended' }));
  }
  return debugAnswer(
    args,
    async () => ({ value: 1, raw: '1' }),
    (v) => v,
  );
}
