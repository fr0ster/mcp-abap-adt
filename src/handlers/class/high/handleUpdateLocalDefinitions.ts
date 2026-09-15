/**
 * UpdateLocalDefinitions Handler - Write a class's local definitions include
 *
 * Uses AdtClient.getLocalDefinitions().update from @mcp-abap-adt/adt-clients 19.
 *
 * **This handler holds no lock — it takes the caller's lock handle as an
 * argument.** Same shape as `UpdateLocalTestClass`: `AdtLocalDefinitions
 * .update()` never takes a lock and never releases one — the lock is the
 * *class's*, taken with `getClass().lock()` and shared across every include.
 * Without a lock handle the shipped endpoint answers "400 Parameter
 * lockHandle could not be found". This changes the tool's surface beyond
 * `detail` — see the task report for why.
 *
 * **The source goes in `options`, not `config`.** The shipped `update()`
 * reads `options?.sourceCode ?? config.definitionsCode`. Verified against
 * `AdtLocalDefinitions.js`.
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
  name: 'UpdateLocalDefinitions',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Write the local definitions include of an existing ABAP class. Takes the lock handle from a prior LockClass call — this tool does not lock or unlock the class itself.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name (e.g., ZCL_MY_CLASS).',
      },
      source_code: {
        type: 'string',
        description: 'Complete source code for the local definitions include.',
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

interface UpdateLocalDefinitionsArgs {
  class_name: string;
  source_code: string;
  lock_handle: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateLocalDefinitions(
  context: HandlerContext,
  args: UpdateLocalDefinitionsArgs,
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
    { tool: 'UpdateLocalDefinitions', detail },
    () =>
      createAdtClient(connection, logger)
        .getLocalDefinitions(resultsFor(classDocuments))
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
