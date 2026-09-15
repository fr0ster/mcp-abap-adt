/**
 * UpdateUnitTest Handler - Write a class's testclasses include (its unit
 * tests)
 *
 * Uses AdtClient.getUnitTest().update from @mcp-abap-adt/adt-clients 19.
 *
 * **This tool no longer refuses.** The pre-migration handler was a
 * deliberate stub: adt-clients 18 had no update capability for a unit test
 * (the SDK's `getUnitTest()` shared one `create()` method for both making the
 * container class and starting a run), so this tool always answered "ADT does
 * not support updating test runs." adt-clients 19's `AdtUnitTest.update()`
 * is a real member — it replaces the whole `testclasses` include of an
 * existing container class — and this tool is repointed at it, changing its
 * surface beyond `detail`: `run_id` (the old, always-refused shape) is gone;
 * `class_name`, `source_code` and `lock_handle` take its place. See the task
 * report for why.
 *
 * **This handler holds no lock — it takes the caller's lock handle as an
 * argument.** `AdtLocalTestClass.update()` (which `AdtUnitTest.update()`
 * delegates to) never takes a lock and never releases one; the lock is the
 * *class's*, taken with `getClass().lock()`. Without a lock handle the
 * shipped endpoint answers "400 Parameter lockHandle could not be found".
 *
 * **The source goes in `config.testClassSource`, not `options.sourceCode`.**
 * `AdtUnitTest.update()`'s shipped body reads `config.testClassSource`
 * unconditionally and forwards it as `testClassCode` — unlike the four class
 * Local* writes, it never looks at `options.sourceCode` at all. Verified
 * against `AdtUnitTest.js`.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateUnitTest',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Update. Subject: the testclasses include of a unit test container class. Replaces the whole include. Takes the lock handle from a prior lock on the container class — this tool does not lock or unlock it itself.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Container class name (e.g., ZCL_MY_TESTS).',
      },
      source_code: {
        type: 'string',
        description: 'Complete source code for the testclasses include.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from a prior lock call on this container class. Required — the shipped write endpoint answers "400 Parameter lockHandle could not be found" without one.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable objects).',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name', 'source_code', 'lock_handle'],
  },
} as const;

interface UpdateUnitTestArgs {
  class_name: string;
  source_code: string;
  lock_handle: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateUnitTest(
  context: HandlerContext,
  args: UpdateUnitTestArgs,
) {
  const { connection, logger } = context;

  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  if (!args?.source_code) {
    return return_error(new Error('source_code is required'));
  }
  if (!args?.lock_handle) {
    return return_error(new Error('lock_handle is required'));
  }

  const className = args.class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateUnitTest', detail },
    () =>
      createAdtClient(connection, logger).getUnitTest(ourUnitTest).update(
        {
          className,
          testClassSource: args.source_code,
          transportRequest: args.transport_request,
        },
        { lockHandle: args.lock_handle, analyse: analyseException },
      ),
    project(detail, terseWrite),
  );
}
