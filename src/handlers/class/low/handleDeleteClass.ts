/**
 * DeleteClass Handler - Delete ABAP Class
 *
 * Uses AdtClient.getClass().delete from @mcp-abap-adt/adt-clients 19.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseDeletion } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteClassLow',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[low-level] Delete an ABAP class from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name (e.g., ZCL_MY_CLASS).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name'],
  },
} as const;

interface DeleteClassArgs {
  class_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteClass(
  context: HandlerContext,
  args: DeleteClassArgs,
) {
  const { connection, logger } = context;
  const { class_name, transport_request } = args;

  if (!class_name) {
    return return_error(new Error('class_name is required'));
  }

  const className = class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteClassLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getClass(resultsFor(classDocuments))
        .delete(
          { className, transportRequest: transport_request },
          { analyse: analyseDeletion },
        ),
    project(detail, terseDeletion),
  );
}
