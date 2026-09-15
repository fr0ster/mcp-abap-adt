/**
 * UpdateCdsUnitTest Handler - Write a CDS unit test container class's
 * testclasses include
 *
 * Uses AdtClient.getCdsUnitTest().{lock,update,unlock} from
 * @mcp-abap-adt/adt-clients 19, through `withLock`.
 *
 * `getCdsUnitTest()` now returns the real `AdtCdsUnitTest` (typed with
 * `update`/`delete`/`lock`/`unlock` on its declared contract), so the
 * `CdsUnitTestWrites` cast this handler used to need is gone. `cdsUnitTestWrites.ts`
 * stays — `DeleteCdsUnitTest` still imports it, and that handler is outside
 * this task's scope.
 *
 * **This handler acquires its own lock.** `AdtCdsUnitTest`'s `lock()`/
 * `unlock()` are inherited from `AdtUnitTest`, which delegate to
 * `this.adtLocalTestClass.lock({className})`/`.unlock(...)` — the same
 * accessor `update()` is called through. Fix round 1: a caller-supplied
 * `lock_handle` param was tried here first and reverted — adt-clients 19
 * moving a lock out of a member does not move it onto the caller, it moves
 * it onto this handler.
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
import { withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateCdsUnitTest',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Update a CDS unit test class local test class source code. Forces activation of the container class after the write. Manages lock, update, and unlock of the container class.',
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
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages).',
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
  const { connection, logger } = context;

  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }
  if (!args?.test_class_source) {
    return return_error(new Error('test_class_source is required'));
  }

  const className = args.class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateCdsUnitTest', detail },
    () => {
      const obj = createAdtClient(connection, logger).getCdsUnitTest(
        ourUnitTest,
      );

      return withLock(
        () => obj.lock({ className }),
        (lockHandle) =>
          obj.update(
            {
              className,
              testClassSource: args.test_class_source,
              transportRequest: args.transport_request,
            },
            { lockHandle, analyse: analyseException },
          ),
        (lockHandle) => obj.unlock({ className }, lockHandle),
      );
    },
    project(detail, terseWrite),
  );
}
