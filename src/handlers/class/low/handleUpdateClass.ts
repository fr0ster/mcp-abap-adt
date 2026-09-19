/**
 * UpdateClass Handler - Update ABAP Class Source Code
 *
 * Uses AdtClient.getClass().update from @mcp-abap-adt/adt-clients 19.
 *
 * **The source goes in `options`, not `config`.** `IClassConfig` still
 * declares a `sourceCode` field, so `update({ className, sourceCode }, ...)`
 * compiles either way — but the shipped `AdtClass.update()` reads
 * `options?.sourceCode` only (its own comment: "This used to fall back to
 * `config.sourceCode` — two channels for one value, where the contract
 * documents one. `config.sourceCode` is `check`'s alone now"). A `.d.ts`
 * comment is not evidence for where a value lands; the compiled JavaScript
 * is. Verified against `AdtClass.js`, not the declaration file.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateClassLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Update source code of an existing ABAP class. Uses session from HandlerContext. Requires lock handle from LockClass operation. - use UpdateClass (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description:
          'Class name (e.g., ZCL_TEST_CLASS_001). Class must already exist.',
      },
      source_code: {
        type: 'string',
        description:
          'Complete ABAP class source code including CLASS DEFINITION and IMPLEMENTATION sections.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockClass operation. Required for update operation.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name', 'source_code', 'lock_handle'],
  },
} as const;

interface UpdateClassArgs {
  class_name: string;
  source_code: string;
  lock_handle: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateClass(
  context: HandlerContext,
  args: UpdateClassArgs,
) {
  const { connection, logger } = context;
  const { class_name, source_code, lock_handle } = args;

  if (!class_name || !source_code || !lock_handle) {
    return return_error(
      new Error('class_name, source_code, and lock_handle are required'),
    );
  }

  const className = class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateClassLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getClass(resultsFor(classDocuments))
        .update(
          { className },
          {
            sourceCode: source_code,
            lockHandle: lock_handle,
            analyse: analyseException,
          },
        ),
    project(detail, terseWrite),
  );
}
