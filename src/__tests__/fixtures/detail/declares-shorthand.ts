/**
 * Fixture for detailSurface.test.ts.
 *
 * The schema declares `detail`, and the `answer()` context uses the
 * shorthand `{ tool, detail }` — the exact form every already-migrated
 * handler in this repository writes, sharing one `const detail = ...`
 * between this context and the `project(detail, terseX)` call below it. The
 * hidden defect this fixture models is not the shorthand itself (a naive
 * check that flagged shorthand outright would fail on the whole corpus) but
 * what the shared `const` is bound to: here it is a hardcoded `'terse'`,
 * not `detailOf(args)` — a parameter the schema advertises and the handler
 * silently ignores, wearing a variable name that looks wired. Must produce
 * exactly one offender.
 */
declare const DETAIL_PROPERTY: Record<string, unknown>;
declare function answer(
  ctx: unknown,
  call: () => unknown,
  project: (value: unknown) => unknown,
): unknown;

export const TOOL_DEFINITION = {
  name: 'FixtureShorthand',
  inputSchema: {
    type: 'object',
    properties: {
      ...DETAIL_PROPERTY,
    },
  },
};

export function handleFixture() {
  const detail = 'terse';
  return answer(
    { tool: 'FixtureShorthand', detail },
    () => undefined,
    (value: unknown) => value,
  );
}
