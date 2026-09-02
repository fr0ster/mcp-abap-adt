/**
 * DeleteUnitTest Handler - Delete ABAP Unit test run via AdtClient
 *
 * Uses AdtClient.getUnitTest().delete() for high-level delete operation.
 * Note: ADT does not support deleting unit test runs.
 */

import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteUnitTest',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Delete an ABAP Unit test run. Note: ADT does not support deleting unit test runs and will return an error.',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by CreateUnitTest/RunUnitTest.',
      },
    },
    required: ['run_id'],
  },
} as const;

interface DeleteUnitTestArgs {
  run_id: string;
}

/**
 * Main handler for DeleteUnitTest MCP tool
 *
 * ADT exposes no resource for deleting a test run, so this refuses instead of
 * pretending. It used to call `AdtClient.getUnitTest().delete()`, which threw
 * the same refusal from inside the client; adt-clients 9.0.0 dropped the method
 * from the declared contract, which is what surfaced the round trip as pointless.
 */
export async function handleDeleteUnitTest(
  _context: HandlerContext,
  args: DeleteUnitTestArgs,
) {
  const { run_id } = (args ?? {}) as DeleteUnitTestArgs;

  if (!run_id) {
    return return_error(new Error('run_id is required'));
  }

  return return_error(
    new Error(
      `Cannot delete unit test run ${run_id}: ADT does not support deleting test runs.`,
    ),
  );
}
