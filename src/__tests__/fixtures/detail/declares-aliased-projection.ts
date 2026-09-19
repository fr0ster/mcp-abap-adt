/**
 * Fixture for detailSurface.test.ts.
 *
 * The schema declares `detail`, and the `answer()` CONTEXT correctly reads
 * it dynamically. The PROJECTION is hardcoded — `project('terse', …)` — but
 * not passed inline; it is bound to a `const` first and handed to
 * `answer()` by NAME, the shape fix round 2 found five real (currently
 * harmless, since none of the five declares `detail`) instances of:
 * `RuntimeListFeeds`, the two profiler readers, and the two class-run
 * handlers all write `const project = (...) => (...); ... answer(ctx,
 * call, project);`. A check that only classified `project(...)` calls and
 * hand-written functions passed INLINE would read this bare identifier as
 * 'unknown' and never flag it. Must produce exactly one offender.
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
  name: 'FixtureAliasedProjection',
  inputSchema: {
    type: 'object',
    properties: {
      ...DETAIL_PROPERTY,
    },
  },
};

export function handleFixture(args: unknown) {
  const detail = detailOf(args);
  const hardcodedProjection = project('terse', terseCheck);
  return answer(
    { tool: 'FixtureAliasedProjection', detail },
    () => undefined,
    hardcodedProjection,
  );
}
