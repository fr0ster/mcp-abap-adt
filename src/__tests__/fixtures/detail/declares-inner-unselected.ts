/**
 * Fixture for detailSurface.test.ts.
 *
 * The schema declares `detail`; the exported handler hands its arguments to
 * a function of the same file that answers one fixed level, while another
 * function, never reached, selects by level. Must produce one offender.
 */
declare const DETAIL_PROPERTY: Record<string, unknown>;
declare function levelOf(args: unknown): 'terse' | 'medium' | 'full' | 'raw';
declare function answerAt(
  table: unknown,
  level: unknown,
): (value: unknown) => unknown;
declare const TABLE: unknown;

export const TOOL_DEFINITION = {
  name: 'FixtureInnerUnselected',
  inputSchema: {
    type: 'object',
    properties: {
      ...DETAIL_PROPERTY,
    },
  },
};

export function handleFixture(context: unknown, args: unknown) {
  return answered(context, args);
}

function answered(_context: unknown, _args: unknown) {
  const shown = answerAt(TABLE, 'terse');
  return { content: [{ type: 'text', text: shown([]) }] };
}

export function unreached(args: unknown) {
  return answerAt(TABLE, levelOf(args));
}
