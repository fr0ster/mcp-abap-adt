import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * CreateFunctionGroupUnitTest — give a function group ABAP Unit tests: create
 * its test include (the group's main program gains the INCLUDE by itself),
 * write the test classes into it, and activate it and the group.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { return_error } from '../../../lib/utils';
import { writeFunctionGroupTests } from '../shared/writeTests';

export const TOOL_DEFINITION = {
  name: 'CreateFunctionGroupUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Creates the ABAP Unit test classes of the function group named by function_group_name, from test_class_source. They are written to a test include, which is activated with the group.',
  inputSchema: z.object({
    function_group_name: z
      .string()
      .describe('Function group that gets the tests. Must already exist.'),
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
