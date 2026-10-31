import {
  byVariant,
  COMPACT_PROFILE,
  compactProfileRunDescription,
  compactProfileRunSchemaFor,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleRuntimeRunClassUnderProfiler,
  handleRuntimeRunProgramUnderProfiler,
} from '@mcp-abap-adt/lib/handlers/write';

export const TOOL_DEFINITION = {
  name: 'HandlerProfileRun',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: compactProfileRunDescription(variant),
    inputSchema: compactProfileRunSchemaFor(COMPACT_PROFILE[variant]),
  })),
} as const;

type HandlerProfileRunArgs = {
  target_type: 'CLASS' | 'PROGRAM';
  class_name?: string;
  program_name?: string;
  profiler_id?: string;
};

const TOOL = 'HandlerProfileRun';

/**
 * The one run of a class or a program (spec §4.6, one ADT request per tool
 * call): under the caller's `profiler_id` when given, plain without it. The
 * schedule is `HandlerProfileSchedule`'s request, and finding the trace the
 * run wrote is the caller's, by `HandlerProfileList`.
 */
export async function handleHandlerProfileRun(
  context: HandlerContext,
  args: HandlerProfileRunArgs,
) {
  if (args.target_type === 'CLASS') {
    return handleRuntimeRunClassUnderProfiler(
      context,
      { class_name: args.class_name, profiler_id: args.profiler_id },
      TOOL,
    );
  }
  return handleRuntimeRunProgramUnderProfiler(
    context,
    { program_name: args.program_name, profiler_id: args.profiler_id },
    TOOL,
  );
}
