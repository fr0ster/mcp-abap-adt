import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * UpdateFunctionGroupUnitTest — replace the test classes in a function group's
 * test include and activate it and the group.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { return_error } from '../../../lib/utils';
import { writeFunctionGroupTests } from '../shared/writeTests';

export const TOOL_DEFINITION = {
  name: 'UpdateFunctionGroupUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Writes test_class_source as the ABAP Unit test classes of the function group named by function_group_name. The local test classes in its test include are rewritten, and it is activated.',
  inputSchema: z.object({
    function_group_name: z
      .string()
      .describe(
        'Function group whose tests are replaced. Its test include must already exist.',
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

type UpdateFunctionGroupUnitTestArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleUpdateFunctionGroupUnitTest(
  context: HandlerContext,
  args: UpdateFunctionGroupUnitTestArgs,
) {
  if (!args?.function_group_name) {
    return return_error(new Error('function_group_name is required'));
  }
  if (typeof args.test_class_source !== 'string' || !args.test_class_source) {
    return return_error(new Error('test_class_source is required'));
  }
  const detail = detailOf(args);
  return answer(
    { tool: 'UpdateFunctionGroupUnitTest', detail },
    () =>
      writeFunctionGroupTests(
        context,
        args.function_group_name,
        args.test_class_source,
        { create: false, transportRequest: args.transport_request },
      ),
    project(detail, terseWrite),
  );
}
