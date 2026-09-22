/**
 * DeleteServiceDefinition Handler - Delete ABAP ServiceDefinition via ADT
 * deletion API
 *
 * Uses AdtClient.getServiceDefinition().delete from
 * @mcp-abap-adt/adt-clients 19. See `handleDeleteDomain.ts` for the shape and
 * the masking this follows: a refusal answers 200, `analyseDeletion` reads
 * it rather than the status, and no lock is taken because a held lock is
 * what makes ADT refuse.
 */

import { serviceDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseDeletion } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteServiceDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete an ABAP service definition from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      service_definition_name: {
        type: 'string',
        description: 'ServiceDefinition name (e.g., Z_MY_SERVICEDEFINITION).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP). A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['service_definition_name'],
  },
} as const;

interface DeleteServiceDefinitionArgs {
  service_definition_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteServiceDefinition(
  context: HandlerContext,
  args: DeleteServiceDefinitionArgs,
) {
  const { connection, logger } = context;
  const { service_definition_name, transport_request } = args;

  if (!service_definition_name) {
    return return_error(new Error('service_definition_name is required'));
  }

  const serviceDefinitionName = service_definition_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteServiceDefinition', detail },
    () =>
      createAdtClient(connection, logger)
        .getServiceDefinition(resultsFor(serviceDefinitionDocuments))
        .delete(
          { serviceDefinitionName, transportRequest: transport_request },
          { analyse: analyseDeletion },
        ),
    project(detail, terseDeletion),
  );
}
