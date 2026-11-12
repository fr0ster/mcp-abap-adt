import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * UpdateProgramUnitTest — replace the test classes in a report's test include
 * and activate it and the report.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { return_error } from '../../../lib/utils';
import { writeProgramTests } from '../shared/writeTests';

export const TOOL_DEFINITION = {
  name: 'UpdateProgramUnitTest',
  available_in: ['onprem'] as const,
  description:
    'Writes test_class_source as the ABAP Unit test classes of the report named by program_name. The local test classes in its test include are rewritten, and it is activated.',
  inputSchema: z.object({
    program_name: z
      .string()
      .describe(
        'Report whose tests are replaced. Its test include must already exist.',
      ),
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

type UpdateProgramUnitTestArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleUpdateProgramUnitTest(
  context: HandlerContext,
  args: UpdateProgramUnitTestArgs,
) {
  if (!args?.program_name) {
    return return_error(new Error('program_name is required'));
  }
  if (typeof args.test_class_source !== 'string' || !args.test_class_source) {
    return return_error(new Error('test_class_source is required'));
  }
  const detail = detailOf(args);
  return answer(
    { tool: 'UpdateProgramUnitTest', detail },
    () =>
      writeProgramTests(context, args.program_name, args.test_class_source, {
        create: false,
        transportRequest: args.transport_request,
      }),
    project(detail, terseWrite),
  );
}
