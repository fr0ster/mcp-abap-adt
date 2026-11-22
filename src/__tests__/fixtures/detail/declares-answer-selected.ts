/**
 * Fixture for detailSurface.test.ts.
 *
 * The schema declares `detail`, and the handler builds its answer from
 * several requests itself, with no `answer()` call: its exported handler
 * selects the answer's formatter by the level asked for —
 * `answerAt(TABLE, levelOf(args))`. Must produce no offender.
 */
declare const DETAIL_PROPERTY: Record<string, unknown>;
declare function levelOf(args: unknown): 'terse' | 'medium' | 'full' | 'raw';
declare function answerAt(
  table: unknown,
  level: unknown,
): (value: unknown) => unknown;
declare const TABLE: unknown;

export const TOOL_DEFINITION = {
  name: 'FixtureAnswerSelected',
  inputSchema: {
    type: 'object',
    properties: {
      ...DETAIL_PROPERTY,
    },
  },
};

export function handleFixture(args: unknown) {
  const shown = answerAt(TABLE, levelOf(args));
  return { content: [{ type: 'text', text: shown([]) }] };
}
