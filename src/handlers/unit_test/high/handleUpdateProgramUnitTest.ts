/**
 * UpdateProgramUnitTest — replace the test classes in a report's test include
 * and activate it and the report.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { return_error } from '../../../lib/utils';
import { writeProgramTests } from '../shared/writeTests';

export const TOOL_DEFINITION = {
  name: 'UpdateProgramUnitTest',
  available_in: ['onprem'] as const,
  description:
    'Update the ABAP Unit tests of a report: replace the local test classes in its test include and activate it.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description:
          'Report whose tests are replaced. Its test include must already exist.',
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
    required: ['program_name', 'test_class_source'],
  },
} as const;

interface UpdateProgramUnitTestArgs {
  program_name: string;
  test_class_source: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

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
