/**
 * RuntimeRunClass Handler - Execute an ABAP class, optionally profiled
 *
 * Uses `new AdtExecutor(connection, logger).getClassExecutor()` from
 * @mcp-abap-adt/adt-clients 19 — not `createAdtClient` (see
 * `handleRuntimeRunProgram.ts` for the same door on the program side).
 *
 * **`runWithProfiling` was split, not deleted**, exactly as it was for
 * programs: `ClassExecutor`'s own doc comment says "Not `IClassExecutor` since
 * 19.0.0 ... a caller who wants the old member writes `scheduleTrace`, then
 * `runWithProfiler` with the id it answered."
 *
 * **This family does not stop there, unlike the program one.** 19 also
 * dropped `traceId` from the run itself — `IAdtExecutors.d.ts`: "`traceId` is
 * gone because a run cannot promise a trace that may not exist yet, may never
 * exist, and may be read a week later. Reading a trace is `IProfiler.list()`
 * and `read()`, whenever the caller is ready." Both class tools here still
 * advertise `trace_id`, and the repository owner ruled (task 24) that the
 * work of finding it moves onto this repository rather than off the
 * contract: snapshot the profiler feed before scheduling, run, then poll
 * `IProfiler.list()` for an id that was not in the snapshot — by SET
 * DIFFERENCE, never by position and never by a text sort of `recordedAt`. See
 * `newTrace.ts` for the search itself and its own reasoning.
 *
 * `max_trace_attempts`/`trace_retry_delay_ms` keep their pre-migration
 * meaning under this search. `trace_lookup_uris` does not survive it —
 * `IProfilerListOptions` is `{ user?: string }`, the whole interface, so
 * there is nowhere to put a URI. It is accepted and ignored, per the same
 * ruling, rather than rebuilt with raw requests below `IProfiler` — going
 * underneath the library's own abstraction to replace a capability it
 * dropped puts this repository back in the business of speaking ADT
 * directly, which is the boundary the two packages exist to keep.
 *
 * `run_status`/`trace_requests_status` are gone in every case: `run` and
 * `runWithProfiler` answer `IAdtResponse<string>` and `ClassExecutor` takes no
 * result strategy, so there is no transport envelope left to read a status
 * from. See CHANGELOG.md.
 */

import { AdtExecutor, AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { newTraceAfter } from '../../../lib/strategies/newTrace';
import { terseClassRun } from '../../../lib/strategies/runProjections';
import { sequence, succeededWith } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeRunClass',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[runtime] Execute an ABAP class implementing if_oo_adt_classrun and return its output. Set profile=true to also capture a profiler trace: schedules the trace, runs the class under it, then searches the profiler feed for the id this run produced (bounded by max_trace_attempts/trace_retry_delay_ms). If the trace has not appeared within that bound, the run still answers success with output and profiler_id but no trace_id — poll RuntimeListProfilerTraceFiles or RuntimeAnalyzeProfilerTrace afterwards.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'ABAP class name to execute.',
      },
      profile: {
        type: 'boolean',
        description:
          'When true, run with the profiler and search the profiler feed for the resulting traceId. Default false.',
      },
      description: {
        type: 'string',
        description:
          'Profiler trace description (only used when profile=true).',
      },
      all_procedural_units: { type: 'boolean' },
      all_misc_abap_statements: { type: 'boolean' },
      all_internal_table_events: { type: 'boolean' },
      all_dynpro_events: { type: 'boolean' },
      aggregate: { type: 'boolean' },
      explicit_on_off: { type: 'boolean' },
      with_rfc_tracing: { type: 'boolean' },
      all_system_kernel_events: { type: 'boolean' },
      sql_trace: { type: 'boolean' },
      all_db_events: { type: 'boolean' },
      max_size_for_trace_file: { type: 'number' },
      amdp_trace: { type: 'boolean' },
      max_time_for_tracing: { type: 'number' },
      max_trace_attempts: {
        type: 'integer',
        minimum: 1,
        description:
          'Max attempts to poll the profiler feed for the trace this run produced (default 5). Only used when profile=true.',
      },
      trace_retry_delay_ms: {
        type: 'integer',
        minimum: 0,
        description:
          'Delay in ms between profiler-feed polling attempts (default 2000). Only used when profile=true.',
      },
      trace_lookup_uris: {
        type: 'array',
        items: { type: 'string', minLength: 1 },
        description:
          'Accepted for backward compatibility; no longer affects trace lookup. adt-clients 19 lists the profiler feed as one endpoint, optionally filtered by user — there is nowhere to put a URI.',
      },
    },
    required: ['class_name'],
  },
} as const;

interface RuntimeRunClassArgs {
  class_name: string;
  profile?: boolean;
  description?: string;
  all_procedural_units?: boolean;
  all_misc_abap_statements?: boolean;
  all_internal_table_events?: boolean;
  all_dynpro_events?: boolean;
  aggregate?: boolean;
  explicit_on_off?: boolean;
  with_rfc_tracing?: boolean;
  all_system_kernel_events?: boolean;
  sql_trace?: boolean;
  all_db_events?: boolean;
  max_size_for_trace_file?: number;
  amdp_trace?: boolean;
  max_time_for_tracing?: number;
  max_trace_attempts?: number;
  trace_retry_delay_ms?: number;
  /** Accepted, no longer read — see the tool description and the file header. */
  trace_lookup_uris?: string[];
}

export async function handleRuntimeRunClass(
  context: HandlerContext,
  args: RuntimeRunClassArgs,
) {
  const { connection, logger } = context;

  if (!args?.class_name) {
    return return_error(new Error('Parameter "class_name" is required'));
  }

  const className = args.class_name.trim().toUpperCase();
  const executor = new AdtExecutor(connection, logger);
  const classExecutor = executor.getClassExecutor();

  if (!args.profile) {
    // No `AdtRuntimeClient`, no profiler feed touched — a plain run does not
    // search for a trace it never asked for.
    return answer(
      { tool: 'RuntimeRunClass', detail: 'terse' },
      () => classExecutor.run({ className }),
      (output: string) => terseClassRun({ className, output }),
    );
  }

  const maxTraceAttempts =
    typeof args.max_trace_attempts === 'number' &&
    Number.isFinite(args.max_trace_attempts) &&
    args.max_trace_attempts >= 1
      ? Math.trunc(args.max_trace_attempts)
      : 5;
  const traceRetryDelayMs =
    typeof args.trace_retry_delay_ms === 'number' &&
    Number.isFinite(args.trace_retry_delay_ms) &&
    args.trace_retry_delay_ms >= 0
      ? Math.trunc(args.trace_retry_delay_ms)
      : 2000;

  const profilerParameters = {
    description: args.description,
    allProceduralUnits: args.all_procedural_units,
    allMiscAbapStatements: args.all_misc_abap_statements,
    allInternalTableEvents: args.all_internal_table_events,
    allDynproEvents: args.all_dynpro_events,
    aggregate: args.aggregate,
    explicitOnOff: args.explicit_on_off,
    withRfcTracing: args.with_rfc_tracing,
    allSystemKernelEvents: args.all_system_kernel_events,
    sqlTrace: args.sql_trace,
    allDbEvents: args.all_db_events,
    maxSizeForTraceFile: args.max_size_for_trace_file,
    amdpTrace: args.amdp_trace,
    maxTimeForTracing: args.max_time_for_tracing,
  };

  const profiler = new AdtRuntimeClient(connection, logger).getProfiler();

  return answer(
    { tool: 'RuntimeRunClass', detail: 'terse' },
    async () => {
      // 1. The snapshot. A refused feed read is a refusal, not an empty feed —
      // reported as-is, before scheduling or running anything.
      const snapshot = await profiler.list();
      if (!snapshot.ok) return snapshot;
      const before = new Set(
        snapshot.getResult().value.map((entry) => entry.id),
      );

      // 2. Schedule, then run. `sequence` hands the id to the next step and
      // then forgets it, so it is captured here — the projection needs it and
      // cannot reach back into a finished sequence.
      let profilerId = '';
      const ran = await sequence(
        () => classExecutor.scheduleTrace(profilerParameters),
        (id: string) => {
          profilerId = id;
          return classExecutor.runWithProfiler(
            { className },
            { profilerId: id },
          );
        },
      );
      if (!ran.ok) return ran;

      // 3. The search. A run that succeeded with no trace written yet is
      // still a successful run: the id is absent, not an error.
      const found = await newTraceAfter(profiler, before, {
        attempts: maxTraceAttempts,
        delayMs: traceRetryDelayMs,
      });
      if (!found.ok) return found;

      return succeededWith({
        className,
        output: ran.getResult().value,
        profilerId,
        traceId: found.getResult().value,
      });
    },
    terseClassRun,
  );
}
