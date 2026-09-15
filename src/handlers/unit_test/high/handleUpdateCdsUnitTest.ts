/**
 * UpdateCdsUnitTest Handler - Write a CDS unit test container class's
 * testclasses include
 *
 * Uses AdtClient.getLocalTestClass().{lock,update,unlock} from
 * @mcp-abap-adt/adt-clients 19, through `withLock`.
 *
 * **This writes through `getLocalTestClass()`, not `getCdsUnitTest()
 * .update()`.** Two independent findings, both confirmed against the
 * shipped `.js`, not the declaration file:
 *
 * 1. `AdtCdsUnitTest.update()` performs no activation at all — the `.d.ts`
 *    comment claiming it "forces activation of the container class after
 *    the write" describes a version of the method that is not the one
 *    shipped. The real body, when both `className` and `testClassSource`
 *    are given: `this.adtLocalTestClass.update({className, testClassCode:
 *    config.testClassSource, transportRequest}, options)` — one call, no
 *    activation, byte-for-byte what `AdtUnitTest.update()`'s own fallback
 *    path already does. There is no CDS-specific behaviour to route through
 *    `getCdsUnitTest()` for.
 * 2. `AdtUnitTest`'s constructor (which `AdtCdsUnitTest` inherits) builds
 *    `this.adtLocalTestClass = new AdtLocalTestClass(connection, logger)`
 *    with no result set — whatever is injected at `getCdsUnitTest(results)`
 *    never reaches it, so `update()`'s answer is read through the shipped
 *    default reading, and `project(detail, terseWrite)` then reads
 *    `.value`/`.status` off a value that is not an `AdtReading` — turning
 *    every successful update into a local `projection_failed` (confirmed
 *    with a real, unmocked `AdtClient` against a recording connection).
 *
 * Given (1), calling `getLocalTestClass()` directly is not a workaround —
 * it is the identical wire request, made through an accessor that composes
 * `IAdtLockable` and honours the injected result set (see the class
 * `Local*` updates in this same task for the same fix applied to the same
 * root cause). `lock()`/`unlock()` are on the same accessor, delegating to
 * the class's own lock.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateCdsUnitTest',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Update a CDS unit test class local test class source code. Manages lock, update, and unlock of the container class.',
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
    (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getLocalTestClass(
        resultsFor(classDocuments),
      );

      return withLock(
        () => obj.lock({ className }),
        (lockHandle) =>
          obj.update(
            { className, transportRequest: args.transport_request },
            {
              sourceCode: args.test_class_source,
              lockHandle,
              analyse: analyseException,
            },
          ),
        (lockHandle) => obj.unlock({ className }, lockHandle),
      );
    },
    project(detail, terseWrite),
  );
}
