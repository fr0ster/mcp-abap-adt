/**
 * What a runtime handler hands its projection.
 *
 * Assembled here from two or three calls (`IProfiler.list()`, `scheduleTrace`,
 * `runWithProfiler`), so there is no single document, no parse and no status
 * to read off it — `IAdtResult<T>` is `{ value }` alone, and `ClassExecutor`
 * takes no result strategy in its constructor.
 */
export interface RuntimeRunValue {
  readonly className: string;
  readonly output?: string;
  readonly profilerId?: string;
  readonly traceId?: string;
}

/**
 * **Not `Terse`.** `Terse<T>` (`projections.ts`) is `(value, status) =>
 * unknown` and `answer()` takes `(value) => unknown`: TypeScript lets a
 * function drop a parameter, not gain a required one, so a `Terse` cannot be
 * passed where `answer()` wants a projection — it would compile in this file
 * and fail TS2345 at the call.
 *
 * There is no status to take here anyway, which is the same reason `project()`
 * is not used on this path: these two handlers pass the projection itself to
 * `answer()`, with `detail: 'terse'` fixed in the context rather than read
 * from a `detail` argument these tools do not declare.
 */
type RuntimeProjection = (value: RuntimeRunValue) => unknown;

/**
 * `RuntimeRunClass`: profiler fields nested under `profile`, and `output` at
 * the top whether or not it profiled.
 *
 * `run_status` is gone and cannot come back — adt-clients 19's `ClassExecutor`
 * exposes no transport envelope to read it from. Do not add it reading
 * `undefined`; that is how a tool ends up answering `"run_status": null`
 * forever.
 */
export const terseClassRun: RuntimeProjection = (value) => ({
  success: true,
  class_name: value.className,
  output: value.output ?? '',
  ...(value.traceId !== undefined || value.profilerId
    ? { profile: { profiler_id: value.profilerId, trace_id: value.traceId } }
    : {}),
});

/**
 * The deprecated `RuntimeRunClassWithProfiling`: the profiler fields flat, and
 * **no `output`** — this tool did not answer one before the migration either,
 * and this work does not add fields to a deprecated tool.
 *
 * `run_status`/`trace_requests_status` are gone for the same reason as above.
 */
export const terseProfilingRun: RuntimeProjection = (value) => ({
  success: true,
  class_name: value.className,
  profiler_id: value.profilerId,
  trace_id: value.traceId,
});
