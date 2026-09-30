/**
 * CreateFunctionGroupUnitTest — give a function group ABAP Unit tests: create
 * its test include (the group's main program gains the INCLUDE by itself),
 * write the test classes into it, and activate it and the group.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { return_error } from '../../../lib/utils';
import { writeFunctionGroupTests } from '../shared/writeTests';

export const TOOL_DEFINITION = {
  name: 'CreateFunctionGroupUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Create ABAP Unit tests for a function group: a test include with its local test classes, activated with the group.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Function group that gets the tests. Must already exist.',
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

interface CreateFunctionGroupUnitTestArgs {
  function_group_name: string;
  test_class_source: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateFunctionGroupUnitTest(
  context: HandlerContext,
  args: CreateFunctionGroupUnitTestArgs,
) {
  if (!args?.function_group_name) {
    return return_error(new Error('function_group_name is required'));
  }
  if (typeof args.test_class_source !== 'string' || !args.test_class_source) {
    return return_error(new Error('test_class_source is required'));
  }
  const detail = detailOf(args);
  return answer(
    { tool: 'CreateFunctionGroupUnitTest', detail },
    () =>
      writeFunctionGroupTests(
        context,
        args.function_group_name,
        args.test_class_source,
        { create: true, transportRequest: args.transport_request },
      ),
    project(detail, terseWrite),
  );
}
