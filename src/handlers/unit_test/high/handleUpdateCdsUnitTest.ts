import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * UpdateCdsUnitTest — replace the tests in a CDS view's ABAP Unit test class
 * (a global class holding them) and activate it.
 */

import { answer } from '../../../lib/answer';
import { updateTool } from '../../../lib/description';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { return_error } from '../../../lib/utils';
import { writeClassTests } from '../shared/writeTests';

export const TOOL_DEFINITION = {
  name: 'UpdateCdsUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description: updateTool({
    object: 'the ABAP Unit test classes of a CDS view test class',
    how: 'from the test class source given, activating it',
    transported: true,
  }),
  inputSchema: z.object({
    class_name: z
      .string()
      .describe('Test class of the CDS view. Must already exist.'),
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

type UpdateCdsUnitTestArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleUpdateCdsUnitTest(
  context: HandlerContext,
  args: UpdateCdsUnitTestArgs,
) {
  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  if (typeof args.test_class_source !== 'string' || !args.test_class_source) {
    return return_error(new Error('test_class_source is required'));
  }
  const detail = detailOf(args);
  return answer(
    { tool: 'UpdateCdsUnitTest', detail },
    () =>
      writeClassTests(
        context,
        args.class_name,
        args.test_class_source,
        args.transport_request,
      ),
    project(detail, terseWrite),
  );
}
