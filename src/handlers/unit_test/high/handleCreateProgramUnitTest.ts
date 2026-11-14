import * as z from 'zod';
import { createArguments } from '../../../lib/handlers/createArguments';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * CreateProgramUnitTest — give a report ABAP Unit tests: create its test
 * include in the report's package, write the test classes into it, pull it
 * into the report with an INCLUDE, and activate both.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { return_error } from '../../../lib/utils';
import { writeProgramTests } from '../shared/writeTests';

export const TOOL_DEFINITION = {
  name: 'CreateProgramUnitTest',
  available_in: ['onprem'] as const,
  description:
    'Creates the ABAP Unit test classes of the report named by program_name, from test_class_source. They are written to a test include, which is included into the report, and the report is activated.',
  inputSchema: createArguments('CreateProgramUnitTest', {
    program_name: z
      .string()
      .describe('Report that gets the tests. Must already exist.'),
    test_class_source: z
      .string()
      .describe(
        'ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.',
      ),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request, not a task. Required for a transportable object.',
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

type CreateProgramUnitTestArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleCreateProgramUnitTest(
  context: HandlerContext,
  args: CreateProgramUnitTestArgs,
) {
  if (!args?.program_name) {
    return return_error(new Error('program_name is required'));
  }
  if (typeof args.test_class_source !== 'string' || !args.test_class_source) {
    return return_error(new Error('test_class_source is required'));
  }
  const detail = detailOf(args);
  return answer(
    { tool: 'CreateProgramUnitTest', detail },
    () =>
      writeProgramTests(context, args.program_name, args.test_class_source, {
        create: true,
        transportRequest: args.transport_request,
      }),
    project(detail, terseWrite),
  );
}
