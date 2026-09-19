/**
 * Fixture for detailSurface.test.ts.
 *
 * The schema declares `detail`, and the `answer()` CONTEXT correctly reads
 * it dynamically — `{ tool, detail }` shorthand bound to `detailOf(args)`,
 * exactly the form every correctly-wired handler writes. But the
 * PROJECTION — `answer()`'s third argument — hardcodes `'terse'`
 * regardless: the tool advertises the parameter and silently ignores it.
 * A check that reads only the context (as an earlier version of this
 * invariant did) cannot see this: the context alone is perfectly wired.
 * Must produce exactly one offender.
 */
declare const DETAIL_PROPERTY: Record<string, unknown>;
declare function detailOf(args: unknown): 'terse' | 'full' | 'raw';
declare function answer(
  ctx: unknown,
  call: () => unknown,
  project: (value: unknown) => unknown,
): unknown;
declare function project(
  detail: unknown,
  terse: unknown,
): (value: unknown) => unknown;
declare const terseCheck: unknown;

export const TOOL_DEFINITION = {
  name: 'FixtureHardcodedProjection',
  inputSchema: {
    type: 'object',
    properties: {
      ...DETAIL_PROPERTY,
    },
  },
};

export function handleFixture(args: unknown) {
  const detail = detailOf(args);
  return answer(
    { tool: 'FixtureHardcodedProjection', detail },
    () => undefined,
    project('terse', terseCheck),
  );
}
