/**
 * ActivateClass Handler - Activate ABAP Class
 *
 * Uses AdtClient.getClass().activate from @mcp-abap-adt/adt-clients 19.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateClassLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP class. Returns activation status and any warnings/errors.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name'],
  },
} as const;

interface ActivateClassArgs {
  class_name: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateClass(
  context: HandlerContext,
  args: ActivateClassArgs,
) {
  const { connection, logger } = context;
  const { class_name } = args;

  if (!class_name) {
    return return_error(new Error('class_name is required'));
  }

  const className = class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateClassLow', detail },
    () =>
      withAdtHeaders(context, 'class.activate', (headers) =>
        createAdtClient(connection, logger)
          .getClass(resultsFor(classDocuments))
          .activate({ className }, { headers, analyse: analyseActivation }),
      ),
    project(detail, terseActivation),
  );
}
