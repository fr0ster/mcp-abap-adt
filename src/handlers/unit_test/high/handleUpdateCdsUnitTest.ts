/**
 * UpdateCdsUnitTest — replace the tests in a CDS view's ABAP Unit test class
 * (a global class holding them) and activate it.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { return_error } from '../../../lib/utils';
import { writeClassTests } from '../shared/writeTests';

export const TOOL_DEFINITION = {
  name: 'UpdateCdsUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Update the ABAP Unit tests of a CDS view: replace the local test classes in its test class and activate it.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Test class of the CDS view. Must already exist.',
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
    required: ['class_name', 'test_class_source'],
  },
} as const;

interface UpdateCdsUnitTestArgs {
  class_name: string;
  test_class_source: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

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
