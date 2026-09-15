/**
 * UpdateLocalTestClass Handler - Write a class's testclasses include
 *
 * Uses AdtClient.getLocalTestClass().update from @mcp-abap-adt/adt-clients 19.
 *
 * **This handler holds no lock — it takes the caller's lock handle as an
 * argument.** `AdtLocalTestClass.update()`'s own doc comment: "This never
 * takes a lock and never releases one... The lock is the *class's*, not the
 * include's: `getClass().lock()` is what takes it, and the same handle serves
 * every include." Without a lock handle the shipped endpoint answers "400
 * Parameter lockHandle could not be found". This changes the tool's surface
 * beyond `detail` — see the task report for why.
 *
 * **The source goes in `options`, not `config`.** The shipped `update()`
 * reads `options?.sourceCode ?? config.testClassCode`, so passing the source
 * either way compiles and works, but every sibling in this family passes it
 * through `options.sourceCode` for one channel across the four Local*
 * writes. Verified against `AdtLocalTestClass.js`.
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
  name: 'UpdateLocalTestClass',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Write the local test class (testclasses include) of an existing ABAP class. Takes the lock handle from a prior LockClass call — this tool does not lock or unlock the class itself.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name (e.g., ZCL_MY_CLASS).',
      },
      source_code: {
        type: 'string',
        description: 'Complete source code for the testclasses include.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from a LockClass call on this class. Required — the shipped write endpoint answers "400 Parameter lockHandle could not be found" without one.',
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

interface UpdateLocalTestClassArgs {
  class_name: string;
  source_code: string;
  lock_handle: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateLocalTestClass(
  context: HandlerContext,
  args: UpdateLocalTestClassArgs,
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
    { tool: 'UpdateLocalTestClass', detail },
    () =>
      createAdtClient(connection, logger)
        .getLocalTestClass(resultsFor(classDocuments))
        .update(
          { className, transportRequest: args.transport_request },
          {
            sourceCode: args.source_code,
            lockHandle: args.lock_handle,
            analyse: analyseException,
          },
        ),
    project(detail, terseWrite),
  );
}
