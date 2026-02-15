import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeCreateProfilerTraceParameters',
  description:
    '[runtime] Create ABAP profiler trace parameters and return profilerId (URI) for profiled execution.',
  inputSchema: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Human-readable trace description.',
      },
      all_misc_abap_statements: { type: 'boolean' },
      all_procedural_units: { type: 'boolean' },
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
    },
    required: ['description'],
  },
} as const;

interface RuntimeCreateProfilerTraceParametersArgs {
  description: string;
  all_misc_abap_statements?: boolean;
  all_procedural_units?: boolean;
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
}

export async function handleRuntimeCreateProfilerTraceParameters(
  context: HandlerContext,
  args: RuntimeCreateProfilerTraceParametersArgs,
) {
  const { connection, logger } = context;

  try {
    if (!args?.description) {
      throw new Error('Parameter "description" is required');
    }

    const runtimeClient = new AdtRuntimeClient(connection, logger);
    const response = await runtimeClient.createProfilerTraceParameters({
      description: args.description,
      allMiscAbapStatements: args.all_misc_abap_statements,
      allProceduralUnits: args.all_procedural_units,
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

    const profilerId = runtimeClient.extractProfilerIdFromResponse(response);

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          profiler_id: profilerId,
          status: response.status,
        },
        null,
        2,
      ),
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      config: response.config,
    });
  } catch (error: any) {
    logger?.error('Error creating profiler trace parameters:', error);
    return return_error(error);
  }
}
