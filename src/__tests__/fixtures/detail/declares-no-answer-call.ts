/**
 * Fixture for detailSurface.test.ts.
 *
 * The tool's schema declares `detail`, but the handler never calls
 * `answer()` at all — the emptiest way to pass a loop-based check: with no
 * call to iterate, a naive walk reports nothing, indistinguishable from a
 * correct handler. Must produce exactly one offender.
 */
declare const DETAIL_PROPERTY: Record<string, unknown>;

export const TOOL_DEFINITION = {
  name: 'FixtureDeclaresNoAnswerCall',
  inputSchema: {
    type: 'object',
    properties: {
      ...DETAIL_PROPERTY,
    },
  },
};

export function handleFixture() {
  return { success: true };
}
