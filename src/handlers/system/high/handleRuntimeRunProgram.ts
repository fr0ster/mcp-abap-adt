import * as z from 'zod';
import { BACKGROUND_FIELD } from '../../../lib/backgroundRuns/tools';
/**
 * RuntimeRunProgram Handler - Execute an ABAP program, optionally profiled
 *
 * Uses `createOnPremExecutor(connection, logger).getProgramExecutor()` (an
 * `AdtExecutor<'onprem'>`) from
 * @mcp-abap-adt/adt-clients 19 — not `createAdtClient`, per
 * `AdtExecutor`'s own shape (see `handleRuntimeRunClass.ts`
 * and Task 24's class-profiling pair for the same door).
 *
 * **`runWithProfiling` was split, not deleted.** `ProgramExecutor`'s own
 * doc comment: "Not `IProgramExecutor` since 19.0.0. That composite
 * includes `IRunnableWithProfiling`, whose `runWithProfiling` scheduled a
 * trace, ran the program under it, and answered both — three requests in
 * one member... a caller who wants the old member writes `scheduleTrace`,
 * then `runWithProfiler` with the id it answered." Composed here with
 * `pair()` rather than `sequence()`: the final answer needs BOTH halves —
 * the scheduled `profilerId` and the run's own output — where `sequence()`
 * keeps only the last step.
 *
 * Neither `run`, `scheduleTrace` nor `runWithProfiler` accepts an
 * `options.analyse` (confirmed against `ProgramExecutor.d.ts`: `run` takes
 * no options at all, `scheduleTrace`'s only parameter is
 * `IProfilerTraceParameters`, and `runWithProfiler`'s is
 * `IProgramExecuteWithProfilerOptions` — just `{ profilerId }`). Their
 * verdict is the library's own, the same absence the where-used and
 * node-structure members in this migration share.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createOnPremExecutor } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { profilerTraceParameters } from '../../../lib/profilerTraceParameters';
import { ourProgramExecutor } from '../../../lib/strategies/resultSets';
import { pair } from '../../../lib/strategies/sequence';
import { atStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RuntimeRunProgram',
  available_in: ['onprem'] as const,
  description:
    '[runtime] Runs the ABAP program (report) named by program_name and returns its output. Set profile=true to also start a profiler trace; the trace is then found in the list of profiler trace files (program execution is fire-and-forget, so the traceId arrives later, through that list).',
  inputSchema: z.object({
    program_name: z.string().describe('ABAP program name to execute.'),
    background: BACKGROUND_FIELD,
    profile: z
      .boolean()
      .optional()
      .describe(
        'When true, run with the profiler. Default false. Trace must be located afterwards via RuntimeListProfilerTraceFiles — program execution does not return traceId synchronously.',
      ),
    description: z
      .string()
      .optional()
      .describe('Profiler trace description (only used when profile=true).'),
    all_procedural_units: z.boolean().optional(),
    all_misc_abap_statements: z.boolean().optional(),
    all_internal_table_events: z.boolean().optional(),
    all_dynpro_events: z.boolean().optional(),
    aggregate: z.boolean().optional(),
    explicit_on_off: z.boolean().optional(),
    with_rfc_tracing: z.boolean().optional(),
    all_system_kernel_events: z.boolean().optional(),
    sql_trace: z.boolean().optional(),
    all_db_events: z.boolean().optional(),
    max_size_for_trace_file: z.number().optional(),
    amdp_trace: z.boolean().optional(),
    max_time_for_tracing: z.number().optional(),
  }),
} as const;

type RuntimeRunProgramArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleRuntimeRunProgram(
  context: HandlerContext,
  args: RuntimeRunProgramArgs,
) {
  const { connection, logger } = context;

  if (!args?.program_name) {
    return return_error(new Error('Parameter "program_name" is required'));
  }

  const programName = args.program_name.trim().toUpperCase();
  // On premise: the tool is listed only where the declared system type is
  // `onprem` (`available_in`), and only that table lists a program's `run`.
  const executor = createOnPremExecutor(connection, logger);
  const programExecutor = executor.getProgramExecutor(ourProgramExecutor);

  if (!args.profile) {
    return answer(
      { tool: 'RuntimeRunProgram', detail: 'terse' },
      () => programExecutor.run({ programName }, { analyse: analyseException }),
      (output: string) => ({
        success: true,
        program_name: programName,
        output: output ?? '',
      }),
    );
  }

  return answer(
    { tool: 'RuntimeRunProgram', detail: 'terse' },
    () =>
      pair(
        atStep('schedule trace', () =>
          withAdtHeaders(context, 'programExecutor.scheduleTrace', (headers) =>
            programExecutor.scheduleTrace({
              ...profilerTraceParameters(args),
              analyse: analyseException,
              headers,
            }),
          ),
        ),
        atStep('run with profiler', (profilerId: string) =>
          programExecutor.runWithProfiler(
            { programName },
            { analyse: analyseException, profilerId },
          ),
        ),
      ),
    ([profilerId, output]: [string, string]) => ({
      success: true,
      program_name: programName,
      output: output ?? '',
      profile: {
        profiler_id: profilerId,
        // traceId is not returned for programs — use RuntimeListProfilerTraceFiles to find it.
      },
    }),
  );
}

/**
 * A program run in one request (compact `HandlerProfileRun`; spec §4.6, one
 * ADT request per tool call).
 *
 * With `profiler_id`: the one `POST /programs/programrun/{name}?profilerId=…`
 * under the trace the caller scheduled. Without it: the one plain program
 * run. An empty `profiler_id` is refused before any request; a failure is
 * the method's error plus `step`.
 */
export async function handleRuntimeRunProgramUnderProfiler(
  context: HandlerContext,
  args: { program_name?: string; profiler_id?: string },
  tool: string,
) {
  const { connection, logger } = context;
  if (!args?.program_name) {
    return return_error(new Error('Parameter "program_name" is required'));
  }
  const profilerId = args.profiler_id;
  if (
    profilerId !== undefined &&
    (typeof profilerId !== 'string' || profilerId === '')
  ) {
    return return_error(
      new Error('Parameter "profiler_id", when given, must not be empty'),
    );
  }
  const programName = args.program_name.trim().toUpperCase();
  const programExecutor = createOnPremExecutor(
    connection,
    logger,
  ).getProgramExecutor(ourProgramExecutor);
  if (profilerId === undefined) {
    return answer(
      { tool, detail: 'terse' },
      atStep('run program', () =>
        programExecutor.run({ programName }, { analyse: analyseException }),
      ),
      (output: string) => ({
        success: true,
        program_name: programName,
        output: output ?? '',
      }),
    );
  }
  return answer(
    { tool, detail: 'terse' },
    atStep('run with profiler', () =>
      programExecutor.runWithProfiler(
        { programName },
        { analyse: analyseException, profilerId },
      ),
    ),
    (output: string) => ({
      success: true,
      program_name: programName,
      output: output ?? '',
      profile: { profiler_id: profilerId },
    }),
  );
}
