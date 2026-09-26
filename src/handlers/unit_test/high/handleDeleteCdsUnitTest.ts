/**
 * DeleteCdsUnitTest Handler - Delete a CDS unit test class (global class)
 *
 * Uses AdtClient.getClass().delete from @mcp-abap-adt/adt-clients 19.
 *
 * **This calls `getClass()` directly, not `getCdsUnitTest().delete()`.**
 * Confirmed against the shipped `AdtCdsUnitTest.js`: `delete()` there is
 * `return this.adtClass.delete({className: config.className,
 * transportRequest: config.transportRequest}, options)` — the whole
 * container class is removed through the deletion service, because (per its
 * own doc comment) "a CDS test class exists only to hold these tests, so
 * removing the tests means removing it". But `this.adtClass` is built by the
 * parent `AdtUnitTest`'s constructor as `new AdtClass(connection, logger)`
 * — **no results injected**, regardless of what `getCdsUnitTest(results)`
 * was given. `classDocuments.deletion` (the shipped default) answers a
 * document as `string`, and `terseDeletion` reads named fields off an
 * object — every successful delete would come back as a local
 * `projection_failed`, the same class of defect task 20 found and fixed for
 * `AdtCdsUnitTest.update()` (see `handleUpdateCdsUnitTest.ts`). Calling
 * `getClass(resultsFor(classDocuments)).delete(...)` directly is the
 * identical wire request, made through an accessor that honours the
 * injected result set — not a workaround.
 *
 * `getCdsUnitTest()`'s declared return type omits `delete` entirely (only
 * `create`/`read`/`readMetadata`/`update`/`validate`/lock/run/status/result/
 * cdsCheck are in its intersection), so the previous cast through
 * `CdsUnitTestWrites` is gone with it — there is nothing left to cast.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { deleteIfDeletable } from '../../../lib/strategies/checkedDeletion';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteCdsUnitTest',
  available_in: ['onprem', 'cloud'] as const,
  description: 'Delete a CDS unit test class (global class).',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Global test class name (e.g., ZCL_CDS_TEST).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (required for transportable packages). A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name'],
  },
} as const;

interface DeleteCdsUnitTestArgs {
  class_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteCdsUnitTest(
  context: HandlerContext,
  args: DeleteCdsUnitTestArgs,
) {
  const { connection, logger } = context;

  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }

  const className = args.class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteCdsUnitTest', detail },
    () =>
      deleteIfDeletable(
        createAdtClient(connection, logger).getClass(
          resultsFor(classDocuments),
        ),
        { className, transportRequest: args.transport_request },
      ),
    project(detail, terseDeletion),
  );
}
