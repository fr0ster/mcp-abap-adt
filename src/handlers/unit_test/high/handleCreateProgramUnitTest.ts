/**
 * CreateProgramUnitTest — give a report ABAP Unit tests: create its test
 * include in the report's package, write the test classes into it, pull it
 * into the report with an INCLUDE, and activate both.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { return_error } from '../../../lib/utils';
import { writeProgramTests } from '../shared/writeTests';

export const TOOL_DEFINITION = {
  name: 'CreateProgramUnitTest',
  available_in: ['onprem'] as const,
  description:
    'Create ABAP Unit tests for a report: a test include with its local test classes, included into the report and activated.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description: 'Report that gets the tests. Must already exist.',
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

interface CreateProgramUnitTestArgs {
  program_name: string;
  test_class_source: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

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
