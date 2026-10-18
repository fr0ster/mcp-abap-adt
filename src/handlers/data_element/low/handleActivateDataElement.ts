/**
 * ActivateDataElement Handler - Activate ABAP Data Element
 *
 * Uses AdtClient.getDataElement().activate from @mcp-abap-adt/adt-clients 19.
 */

import { dataElementDocuments } from '@mcp-abap-adt/adt-clients';
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
  name: 'ActivateDataElementLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP data element. Returns activation status and any warnings/errors.',
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description: 'Data element name.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['data_element_name'],
  },
} as const;

interface ActivateDataElementArgs {
  data_element_name: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateDataElement(
  context: HandlerContext,
  args: ActivateDataElementArgs,
) {
  const { connection, logger } = context;
  const { data_element_name } = args;

  if (!data_element_name) {
    return return_error(new Error('data_element_name is required'));
  }

  const dataElementName = data_element_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateDataElementLow', detail },
    () =>
      withAdtHeaders(context, 'dataElement.activate', (headers) =>
        createAdtClient(connection, logger)
          .getDataElement(resultsFor(dataElementDocuments))
          .activate(
            { dataElementName },
            { headers, analyse: analyseActivation },
          ),
      ),
    project(detail, terseActivation),
  );
}
