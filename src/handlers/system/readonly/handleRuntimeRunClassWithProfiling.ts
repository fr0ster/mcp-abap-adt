import { AdtExecutor } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeRunClassWithProfiling',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[runtime] Execute ABAP class with profiler enabled and return created profilerId + traceId.',
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
          'Max polling attempts to resolve traceId after execution (default 5). Increase for slow systems (e.g. SAP trial cloud).',
      },
      trace_retry_delay_ms: {
        type: 'integer',
        minimum: 0,
        description:
          'Delay in ms between trace polling attempts (default 2000).',
      },
      trace_lookup_uris: {
        type: 'array',
        items: { type: 'string', minLength: 1 },
        description:
          'Additional URIs to consult when resolving the trace (advanced).',
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
  trace_lookup_uris?: string[];
}

export async function handleRuntimeRunClassWithProfiling(
  context: HandlerContext,
  args: RuntimeRunClassWithProfilingArgs,
) {
  const { connection, logger } = context;

  try {
    if (!args?.class_name) {
      throw new Error('Parameter "class_name" is required');
    }

    const className = args.class_name.trim().toUpperCase();
    const executor = new AdtExecutor(connection, logger);
    const classExecutor = executor.getClassExecutor();

    const maxTraceAttempts =
      typeof args.max_trace_attempts === 'number' &&
      Number.isFinite(args.max_trace_attempts) &&
      args.max_trace_attempts >= 1
        ? Math.trunc(args.max_trace_attempts)
        : undefined;
    const traceRetryDelayMs =
      typeof args.trace_retry_delay_ms === 'number' &&
      Number.isFinite(args.trace_retry_delay_ms) &&
      args.trace_retry_delay_ms >= 0
        ? Math.trunc(args.trace_retry_delay_ms)
        : undefined;
    const traceLookupUris = Array.isArray(args.trace_lookup_uris)
      ? args.trace_lookup_uris.filter(
          (uri): uri is string => typeof uri === 'string' && uri.length > 0,
        )
      : undefined;

    const result = await classExecutor.runWithProfiling(
      { className },
      {
        maxTraceAttempts,
        traceRetryDelayMs,
        traceLookupUris,
        profilerParameters: {
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
        },
      },
    );

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          class_name: className,
          profiler_id: result.profilerId,
          trace_id: result.traceId,
          run_status: result.response?.status,
          trace_requests_status: result.traceRequestsResponse?.status,
        },
        null,
        2,
      ),
      status: result.response?.status,
      statusText: result.response?.statusText,
      headers: result.response?.headers,
      config: result.response?.config,
    });
  } catch (error: any) {
    logger?.error('Error running class with profiling:', error);
    return return_error(error);
  }
}
