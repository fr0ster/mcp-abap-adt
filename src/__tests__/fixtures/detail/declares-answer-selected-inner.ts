/**
 * Fixture for detailSurface.test.ts.
 *
 * The schema declares `detail`; the exported handler answers `raw` as the
 * wire documents and hands its arguments, whole, to a function of the same
 * file that selects the answer's formatter by the level asked for —
 * `answerAt(TABLE, levelOf(args))`. Must produce no offender.
 */
declare const DETAIL_PROPERTY: Record<string, unknown>;
declare function levelOf(args: unknown): 'terse' | 'medium' | 'full' | 'raw';
declare function answerAt(
  table: unknown,
  level: unknown,
): (value: unknown) => unknown;
declare function wireAnswer(run: () => unknown): unknown;
declare const TABLE: unknown;

export const TOOL_DEFINITION = {
  name: 'FixtureAnswerSelectedInner',
  inputSchema: {
    type: 'object',
    properties: {
      ...DETAIL_PROPERTY,
    },
  },
};

export function handleFixture(context: unknown, args: unknown) {
  if (levelOf(args) === 'raw') return wireAnswer(() => answered(context, args));
  return answered(context, args);
}

function answered(_context: unknown, args: unknown) {
  const shown = answerAt(TABLE, levelOf(args));
  return { content: [{ type: 'text', text: shown([]) }] };
}
