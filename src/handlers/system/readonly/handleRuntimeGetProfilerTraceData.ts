import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';
import { parseRuntimePayloadToJson } from './runtimePayloadParser';

export const TOOL_DEFINITION = {
  name: 'RuntimeGetProfilerTraceData',
  description:
    '[runtime] Read profiler trace data by trace id/uri: hitlist, statements, or db accesses. Returns parsed JSON payload.',
  inputSchema: {
    type: 'object',
    properties: {
      trace_id_or_uri: {
        type: 'string',
        description: 'Profiler trace ID or full ADT trace URI.',
      },
      view: {
        type: 'string',
        enum: ['hitlist', 'statements', 'db_accesses'],
        description: 'Trace view to retrieve.',
      },
      with_system_events: {
        type: 'boolean',
        description: 'Include system events.',
      },
      id: {
        type: 'number',
        description: 'Statement node ID (for statements view).',
      },
      with_details: {
        type: 'boolean',
        description: 'Include statement details (for statements view).',
      },
      auto_drill_down_threshold: {
        type: 'number',
        description: 'Auto drill-down threshold (for statements view).',
      },
    },
    required: ['trace_id_or_uri', 'view'],
  },
} as const;

interface RuntimeGetProfilerTraceDataArgs {
  trace_id_or_uri: string;
  view: 'hitlist' | 'statements' | 'db_accesses';
  with_system_events?: boolean;
  id?: number;
  with_details?: boolean;
  auto_drill_down_threshold?: number;
}

export async function handleRuntimeGetProfilerTraceData(
  context: HandlerContext,
  args: RuntimeGetProfilerTraceDataArgs,
) {
  const { connection, logger } = context;

  try {
    if (!args?.trace_id_or_uri) {
      throw new Error('Parameter "trace_id_or_uri" is required');
    }

    const runtimeClient = new AdtRuntimeClient(connection, logger);
    const response =
      args.view === 'hitlist'
        ? await runtimeClient.getProfilerTraceHitList(args.trace_id_or_uri, {
            withSystemEvents: args.with_system_events,
          })
        : args.view === 'statements'
          ? await runtimeClient.getProfilerTraceStatements(
              args.trace_id_or_uri,
              {
                id: args.id,
                withDetails: args.with_details,
                autoDrillDownThreshold: args.auto_drill_down_threshold,
                withSystemEvents: args.with_system_events,
              },
            )
          : await runtimeClient.getProfilerTraceDbAccesses(
              args.trace_id_or_uri,
              {
                withSystemEvents: args.with_system_events,
              },
            );

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          view: args.view,
          trace_id_or_uri: args.trace_id_or_uri,
          status: response.status,
          payload: parseRuntimePayloadToJson(response.data),
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
    logger?.error('Error reading profiler trace data:', error);
    return return_error(error);
  }
}
