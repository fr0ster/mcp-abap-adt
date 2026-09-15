/**
 * CreateTransport Handler - Create ABAP Transport Request
 *
 * Uses AdtClient.getRequest().create from @mcp-abap-adt/adt-clients 19.
 *
 * **`created` is NOT kept as shipped — `resultsFor(transportDocuments)`
 * plain, then the number is parsed out here.** Same reasoning as
 * `CreateTransportLow`: `transportDocuments.created` (the shipped
 * `parseCreatedTransport`) reads the body, which `verbatim` (the table's
 * default for the slot name `created`) already carries whole, as a string,
 * in `AdtReading.value`. Parsing the number out of that value in the
 * projection is what keeps `resultsFor`'s two-exception keep-list at two.
 *
 * No corpus fixture for `/cts/transportrequests` POST exists — the document
 * below is hand-built from the shipped `parseCreatedTransport` and
 * `create.js`'s own XML, not proven against a captured response.
 */

import {
  parseCreatedTransport,
  transportDocuments,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, type Terse } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateTransport',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Create a new ABAP transport request in SAP system for development objects.',
  inputSchema: {
    type: 'object',
    properties: {
      transport_type: {
        type: 'string',
        description:
          "Transport type: 'workbench' (cross-client) or 'customizing' (client-specific)",
        enum: ['workbench', 'customizing'],
        default: 'workbench',
      },
      description: {
        type: 'string',
        description: 'Transport request description (mandatory)',
      },
      target_system: {
        type: 'string',
        description:
          "Target system for transport (optional, e.g., 'PRD', 'QAS'). If not provided or empty, uses 'LOCAL'",
      },
      owner: {
        type: 'string',
        description: 'Transport owner (optional, defaults to current user)',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['description'],
  },
} as const;

interface CreateTransportArgs {
  transport_type?: 'workbench' | 'customizing';
  description: string;
  target_system?: string;
  owner?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateTransport(
  context: HandlerContext,
  args: CreateTransportArgs,
) {
  const { connection, logger } = context;

  if (!args?.description) {
    return return_error(new Error('description is required'));
  }

  const detail = detailOf(args);

  const terseCreatedTransport: Terse<string> = (value) => {
    const created = parseCreatedTransport(value);
    return {
      success: true,
      transport_number: created.transportNumber,
      description: created.description ?? args.description,
      transport_type: args.transport_type || 'workbench',
      target_system: created.targetSystem ?? args.target_system ?? null,
      owner: created.owner ?? args.owner ?? null,
      message: `Transport request ${created.transportNumber} created successfully.`,
    };
  };

  return answer(
    { tool: 'CreateTransport', detail },
    () =>
      createAdtClient(connection, logger)
        .getRequest(resultsFor(transportDocuments))
        .create(
          {
            description: args.description,
            transportType: args.transport_type || 'workbench',
            targetSystem: args.target_system,
            owner: args.owner,
          },
          { analyse: analyseException },
        ),
    project(detail, terseCreatedTransport),
  );
}
