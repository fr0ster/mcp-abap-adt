/**
 * Fixture for detailSurface.test.ts.
 *
 * The schema declares `detail`, and the handler calls no `answer()` of its
 * own: it hands its arguments, whole, to another handler and answers what
 * that one answers — the `detail` reaches the handler that reads it. Must
 * produce no offender.
 */
declare const DETAIL_PROPERTY: Record<string, unknown>;
declare function handleOther(context: unknown, args: unknown): unknown;

export const TOOL_DEFINITION = {
  name: 'FixtureDelegatesArgs',
  inputSchema: {
    type: 'object',
    properties: {
      ...DETAIL_PROPERTY,
    },
  },
};

export function handleFixture(context: unknown, args: unknown) {
  return handleOther(context, args);
}
