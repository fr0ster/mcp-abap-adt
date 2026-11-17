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
  readonly traceId?: string | undefined;
}

/**
 * What `terseClassRun` answers. **Not a `Terse`:** a `Terse<T>`
 * (`projections.ts`) takes `(value, status)`, and there is no status here —
 * these handlers pass the projection itself to `answer()`, with
 * `detail: 'terse'` fixed in the context rather than read from a `detail`
 * argument these tools do not declare.
 */
export type TerseClassRun = {
  success: true;
  class_name: string;
  output: string;
  profile?: { profiler_id: string | undefined; trace_id: string | undefined };
};

/**
 * `RuntimeRunClass`: profiler fields nested under `profile`, and `output` at
 * the top whether or not it profiled.
 *
 * `run_status` is gone and cannot come back — adt-clients 19's `ClassExecutor`
 * exposes no transport envelope to read it from. Do not add it reading
 * `undefined`; that is how a tool ends up answering `"run_status": null`
 * forever.
 */
export const terseClassRun = (value: RuntimeRunValue): TerseClassRun => ({
  success: true,
  class_name: value.className,
  output: value.output ?? '',
  ...(value.traceId !== undefined || value.profilerId
    ? { profile: { profiler_id: value.profilerId, trace_id: value.traceId } }
    : {}),
});
