/**
 * Fixture for detailSurface.test.ts.
 *
 * The tool's schema declares `detail`, and the handler even reads it via
 * `detailOf(args)` — but the `answer()` context is assembled in a variable
 * first and passed by reference, not as an inline object literal. The walk
 * cannot follow the identifier to what it holds, and reports that rather
 * than assuming the wiring is fine. Must produce exactly one offender.
 */
declare const DETAIL_PROPERTY: Record<string, unknown>;
declare function detailOf(args: unknown): 'terse' | 'full' | 'raw';
declare function answer(
  ctx: unknown,
  call: () => unknown,
  project: (value: unknown) => unknown,
): unknown;

export const TOOL_DEFINITION = {
  name: 'FixtureIndirectContext',
  inputSchema: {
    type: 'object',
    properties: {
      ...DETAIL_PROPERTY,
    },
  },
};

export function handleFixture(args: unknown) {
  const detail = detailOf(args);
  const ctx = { tool: 'FixtureIndirectContext', detail };
  return answer(
    ctx,
    () => undefined,
    (value: unknown) => value,
  );
}
