/**
 * UpdateFunctionGroupUnitTest — replace the test classes in a function group's
 * test include and activate it and the group.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { return_error } from '../../../lib/utils';
import { writeFunctionGroupTests } from '../shared/writeTests';

export const TOOL_DEFINITION = {
  name: 'UpdateFunctionGroupUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Update the ABAP Unit tests of a function group: replace the local test classes in its test include and activate it.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description:
          'Function group whose tests are replaced. Its test include must already exist.',
      },
      test_class_source: {
        type: 'string',
        description:
          'ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request, not a task. Required for a transportable object.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['function_group_name', 'test_class_source'],
  },
} as const;

interface UpdateFunctionGroupUnitTestArgs {
  function_group_name: string;
  test_class_source: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

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
