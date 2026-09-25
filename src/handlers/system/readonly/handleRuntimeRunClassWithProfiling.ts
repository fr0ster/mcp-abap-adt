/**
 * RuntimeRunClassWithProfiling Handler - Execute ABAP class with profiler
 * enabled [deprecated, kept for backward compatibility]
 *
 * Uses `new AdtExecutor(connection, logger).getClassExecutor()` from
 * @mcp-abap-adt/adt-clients 19. Same `scheduleTrace` → `runWithProfiler` →
 * feed-search shape as `handleRuntimeRunClass.ts` (see that file's header for
 * the full reasoning and citations) — this tool always takes the profiled
 * path, and never answers `output`: it did not before the migration either,
 * and this work adds no field to a deprecated tool.
 */

import { AdtExecutor, AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { definedOnly } from '../../../lib/definedOnly';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { newTraceAfter } from '../../../lib/strategies/newTrace';
import { terseProfilingRun } from '../../../lib/strategies/runProjections';
import { sequence, succeededWith } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeRunClassWithProfiling',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[runtime][deprecated] Execute ABAP class with profiler enabled: schedules a trace, runs the class under it, then searches the profiler feed for the trace id this run produced (bounded by max_trace_attempts/trace_retry_delay_ms). trace_id is absent if the trace has not appeared within that bound. No run_status or trace_requests_status field is returned — the client exposes no transport status for a run. Prefer RuntimeRunClass with profile=true; this tool is kept for backward compatibility and will be removed in a future major release.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'ABAP class name to execute.',
      },
      description: {
        type: 'string',
        description: 'Profiler trace description.',
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
          'Max attempts to poll the profiler feed for the trace this run produced (default 5). Increase for slow systems (e.g. SAP trial cloud).',
      },
      trace_retry_delay_ms: {
        type: 'integer',
        minimum: 0,
        description:
          'Delay in ms between profiler-feed polling attempts (default 2000).',
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

interface RuntimeRunClassWithProfilingArgs {
  class_name: string;
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

export async function handleRuntimeRunClassWithProfiling(
  context: HandlerContext,
  args: RuntimeRunClassWithProfilingArgs,
) {
  const { connection, logger } = context;

  if (!args?.class_name) {
    return return_error(new Error('Parameter "class_name" is required'));
  }

  const className = args.class_name.trim().toUpperCase();
  const executor = new AdtExecutor(connection, logger);
  const classExecutor = executor.getClassExecutor();

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

  const profilerParameters = definedOnly({
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
  });

  const profiler = new AdtRuntimeClient(connection, logger).getProfiler();

  return answer(
    { tool: 'RuntimeRunClassWithProfiling', detail: 'terse' },
    async () => {
      const snapshot = await profiler.list();
      if (!snapshot.ok) return snapshot;
      const before = new Set(
        snapshot.getResult().value.map((entry) => entry.id),
      );

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

      const found = await newTraceAfter(profiler, before, {
        attempts: maxTraceAttempts,
        delayMs: traceRetryDelayMs,
      });
      if (!found.ok) return found;

      return succeededWith({
        className,
        profilerId,
        traceId: found.getResult().value,
      });
    },
    terseProfilingRun,
  );
}
