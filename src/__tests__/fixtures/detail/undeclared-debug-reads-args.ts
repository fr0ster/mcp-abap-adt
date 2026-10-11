/**
 * Fixture for detailSurface.test.ts.
 *
 * The tool's schema declares no `detail`, yet hands its arguments to the
 * debugger's adapter, which reads `detail` from them: a parameter no caller
 * is offered. Must produce exactly one offender.
 */
declare function debugStateAnswer(
  args: unknown,
  work: () => Promise<unknown>,
): Promise<unknown>;

export const TOOL_DEFINITION = {
  name: 'FixtureUndeclaredDebugReadsArgs',
  inputSchema: { type: 'object', properties: {} },
};

export async function handleFixture(_context: unknown, args: unknown) {
  return debugStateAnswer(args, async () => ({ state: 'ended' }));
}
