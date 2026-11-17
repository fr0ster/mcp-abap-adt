import * as z from 'zod';
import { createArguments } from '../../../lib/handlers/createArguments';
import { MASTER_LANGUAGE_DESCRIPTION } from '../../../lib/masterLanguage';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * CreateProgram Handler - ABAP Program Creation via ADT API
 *
 * Uses AdtClient.getProgram().create from @mcp-abap-adt/adt-clients 19.
 *
 * A create is one request, and its own answer: `resultSets.ts` maps the
 * `created` slot to `verbatim`, so `project(detail, terseWrite)` still reads
 * the status for `terse` while `full`/`raw` answer the document ADT sent
 * instead of discarding it. The pre-migration handler's own `validate()`
 * call is dropped — this is a bare create, matching `CreateProgramLow`.
 * `description` and `application` reach the wire; no source — that is
 * `UpdateProgram`'s job, after `LockProgram`.
 *
 * **No program type.** SAP ignores `program:programType` on create (measured
 * on premise: module pool, subroutine pool, `M` and `F` each gave an
 * executable program), so the tool takes none.
 */

import { programDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createOnPremAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'CreateProgram',
  available_in: ['onprem'] as const,
  description:
    'Create a new ABAP program (report) in SAP system. Creates the program object in initial state.',
  inputSchema: createArguments('CreateProgram', {
    program_name: z.string().describe('Program name.'),
    description: z
      .string()
      .optional()
      .describe(
        'Program description. If not provided, program_name will be used.',
      ),
    package_name: z.string().describe('Package name'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number, not a task. Required for transportable packages.',
      ),
    application: z
      .string()
      .optional()
      .describe(
        "Application area (e.g., 'S' for System, 'M' for Materials Management). Default: '*'",
      ),
    master_language: z
      .string()
      .optional()
      .describe(MASTER_LANGUAGE_DESCRIPTION),
    ...DETAIL_SHAPE,
  }),
} as const;

type CreateProgramArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleCreateProgram(
  context: HandlerContext,
  args: CreateProgramArgs,
) {
  const { connection, logger } = context;

  if (!args.program_name || !args.package_name) {
    return return_error(
      new Error('Missing required parameters: program_name and package_name'),
    );
  }

  validateTransportRequest(args.package_name, args.transport_request);

  const programName = args.program_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateProgram', detail },
    () =>
      withAdtHeaders(context, 'program.create', (headers) =>
        createOnPremAdtClient(connection, logger)
          .getProgram(resultsFor(programDocuments))
          .create(
            {
              programName,
              description: args.description || programName,
              packageName: args.package_name,
              transportRequest: args.transport_request,
              application: args.application,
              masterLanguage: args.master_language,
            },
            { headers, analyse: analyseException },
          ),
      ),
    project(detail, terseWrite),
  );
}
