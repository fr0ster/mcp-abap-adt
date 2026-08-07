/**
 * UpdateUnitTest Handler - Update ABAP Unit test run via AdtClient
 *
 * Note: ADT does not support update for unit test runs.
 */

import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateUnitTest',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Update an ABAP Unit test run. Note: ADT does not support updating unit test runs and will return an error.',
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

interface UpdateUnitTestArgs {
  run_id: string;
}

/**
 * Main handler for UpdateUnitTest MCP tool
 *
 * ADT exposes no resource for updating a test run, so this refuses instead of
 * pretending. It used to call `AdtClient.getUnitTest().update()`, which threw
 * the same refusal from inside the client; adt-clients 9.0.0 dropped the method
 * from the declared contract, which is what surfaced the round trip as pointless.
 */
export async function handleUpdateUnitTest(
  _context: HandlerContext,
  args: UpdateUnitTestArgs,
) {
  const { run_id } = (args ?? {}) as UpdateUnitTestArgs;

  if (!run_id) {
    return return_error(new Error('run_id is required'));
  }

  return return_error(
    new Error(
      `Cannot update unit test run ${run_id}: ADT does not support updating test runs.`,
    ),
  );
}
