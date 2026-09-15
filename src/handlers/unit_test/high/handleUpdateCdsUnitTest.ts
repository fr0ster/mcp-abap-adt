/**
 * UpdateCdsUnitTest Handler - Write a CDS unit test container class's
 * testclasses include
 *
 * Uses AdtClient.getCdsUnitTest().update from @mcp-abap-adt/adt-clients 19.
 *
 * `getCdsUnitTest()` now returns the real `AdtCdsUnitTest` (typed with
 * `update`/`delete` on its declared contract), so the `CdsUnitTestWrites`
 * cast this handler used to need is gone. `cdsUnitTestWrites.ts` stays —
 * `DeleteCdsUnitTest` still imports it, and that handler is outside this
 * task's scope.
 *
 * **This handler holds no lock — it takes the caller's lock handle as an
 * argument.** Same shape as `UpdateUnitTest`: `AdtCdsUnitTest.update()`
 * delegates to `AdtLocalTestClass.update()`, which never takes a lock and
 * never releases one. Without a lock handle the shipped endpoint answers
 * "400 Parameter lockHandle could not be found". This changes the tool's
 * surface beyond `detail` — see the task report for why.
 *
 * **The source goes in `config.testClassSource`, and it is the field that
 * selects the CDS-specific path.** `AdtCdsUnitTest.update()`'s shipped body:
 * `if (!(config.className && config.testClassSource)) return
 * super.update(config, options);` — passing both routes through its own
 * branch, which forces the container class to activate after the write (the
 * plain `AdtUnitTest.update()` does not); passing only one would silently
 * fall back to the parent's behaviour. Verified against `AdtCdsUnitTest.js`.
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
  name: 'UpdateCdsUnitTest',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Update a CDS unit test class local test class source code. Forces activation of the container class after the write. Takes the lock handle from a prior lock on the container class — this tool does not lock or unlock it itself.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Global test class name (e.g., ZCL_CDS_TEST).',
      },
      test_class_source: {
        type: 'string',
        description: 'Updated local test class ABAP source code.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from a prior lock call on this container class. Required — the shipped write endpoint answers "400 Parameter lockHandle could not be found" without one.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages).',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name', 'test_class_source', 'lock_handle'],
  },
} as const;

interface UpdateCdsUnitTestArgs {
  class_name: string;
  test_class_source: string;
  lock_handle: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateCdsUnitTest(
  context: HandlerContext,
  args: UpdateCdsUnitTestArgs,
) {
  const { connection, logger } = context;

  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  if (!args?.test_class_source) {
    return return_error(new Error('test_class_source is required'));
  }
  if (!args?.lock_handle) {
    return return_error(new Error('lock_handle is required'));
  }

  const className = args.class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateCdsUnitTest', detail },
    () =>
      createAdtClient(connection, logger).getCdsUnitTest(ourUnitTest).update(
        {
          className,
          testClassSource: args.test_class_source,
          transportRequest: args.transport_request,
        },
        { lockHandle: args.lock_handle, analyse: analyseException },
      ),
    project(detail, terseWrite),
  );
}
