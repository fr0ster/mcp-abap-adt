/**
 * CheckDataElement Handler - Syntax check for ABAP Data Element
 *
 * Uses AdtClient.getDataElement().check from @mcp-abap-adt/adt-clients 19.
 */

import { dataElementDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckDataElementLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP data element. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description: 'DataElement name.',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Which version to check. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['data_element_name'],
  },
} as const;

interface CheckDataElementArgs {
  data_element_name: string;
  version?: 'active' | 'inactive';
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckDataElement(
  context: HandlerContext,
  args: CheckDataElementArgs,
) {
  const { connection, logger } = context;
  const { data_element_name } = args;

  if (!data_element_name) {
    return return_error(new Error('data_element_name is required'));
  }

  const dataElementName = data_element_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckDataElementLow', detail },
    () =>
      withAdtHeaders(context, 'dataElement.check', (headers) =>
        createAdtClient(connection, logger)
          .getDataElement(resultsFor(dataElementDocuments))
          .check(
            { dataElementName },
            args.version === 'inactive' ? 'inactive' : 'active',
            {
              headers,
              analyse: analyseException,
            },
          ),
      ),
    project(detail, terseCheck),
  );
}
