/**
 * DeleteDataElement Handler - Delete ABAP Data Element via ADT deletion API
 *
 * Uses AdtClient.getDataElement().delete from @mcp-abap-adt/adt-clients 19.
 * See `handleDeleteDomain.ts` for the shape and the masking this follows: a
 * refusal answers 200, `analyseDeletion` reads it rather than the status,
 * and no lock is taken because a held lock is what makes ADT refuse.
 */

import { dataElementDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { deleteIfDeletable } from '../../../lib/strategies/checkedDeletion';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteDataElement',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete an ABAP data element from the SAP system via ADT deletion API. Transport request optional for local objects.',
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description: 'Data element name.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number, not a task. Required for transportable objects. Optional for local objects.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['data_element_name'],
  },
} as const;

interface DeleteDataElementArgs {
  data_element_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteDataElement(
  context: HandlerContext,
  args: DeleteDataElementArgs,
) {
  const { connection, logger } = context;
  const { data_element_name, transport_request } = args;

  if (!data_element_name) {
    return return_error(new Error('data_element_name is required'));
  }

  const dataElementName = data_element_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteDataElement', detail },
    () =>
      deleteIfDeletable(
        createAdtClient(connection, logger).getDataElement(
          resultsFor(dataElementDocuments),
        ),
        { dataElementName, transportRequest: transport_request },
      ),
    project(detail, terseDeletion),
  );
}
