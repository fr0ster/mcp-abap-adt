/**
 * DeleteUnitTest — remove every ABAP Unit test of a class: its test include
 * is written empty and the class activated. The class itself stays.
 */

import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { return_error } from '../../../lib/utils';
import { writeClassTests } from '../shared/writeTests';

export const TOOL_DEFINITION = {
  name: 'DeleteUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete the ABAP Unit tests of a class: remove its local test classes. The class itself stays.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class that holds the tests. Must already exist.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request, not a task. Required for a transportable object.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name'],
  },
} as const;

interface DeleteUnitTestArgs {
  class_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteUnitTest(
  context: HandlerContext,
  args: DeleteUnitTestArgs,
) {
  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  const detail = detailOf(args);
  return answer(
    { tool: 'DeleteUnitTest', detail },
    () => writeClassTests(context, args.class_name, '', args.transport_request),
    project(detail, terseWrite),
  );
}
