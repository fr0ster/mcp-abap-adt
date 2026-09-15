/**
 * CreateTransport Handler - Create ABAP Transport Request
 *
 * Uses AdtClient.getRequest().create from @mcp-abap-adt/adt-clients 19.
 *
 * **`created` is kept as shipped, not remapped through `resultsFor`'s
 * `verbatim`.** `transportDocuments.created` is already its own reading —
 * `parseCreatedTransport`, which reads `tm:root`/`tm:request` into
 * `{ transportNumber, description, type, targetSystem, … }` — not the
 * generic `rawDocument` every other slot in this set answers. `resultsFor`
 * without a `keep` list would silently replace it with `verbatim` (the
 * table's default for the slot name `created`), discarding the transport
 * number a caller needs for every subsequent object-transport assignment and
 * handing back the raw XML instead. `resultsFor(transportDocuments,
 * ['created'])` is the same mechanism `ourUtils` uses to keep `activation`
 * for the same reason: the shipped reading sees something the table's three
 * generic readings cannot.
 *
 * No corpus fixture for `/cts/transportrequests` POST exists — the README's
 * coverage table lists only the GET (an empty list, for `ListTransports`) —
 * so the field names below are read from the shipped `parseCreatedTransport`
 * and `create.js`, not proven against a captured document.
 */

import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateTransportLow',
  available_in: ['onprem', 'cloud'] as const,
  description: '[low-level] Create a new ABAP transport request.',
  inputSchema: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Transport request description.',
      },
      transport_type: {
        type: 'string',
        description:
          "Transport type: 'workbench' or 'customizing' (optional, default: 'workbench').",
        enum: ['workbench', 'customizing'],
      },
    },
    required: ['description'],
  },
} as const;

interface CreateTransportArgs {
  description: string;
  transport_type?: 'workbench' | 'customizing';
}

interface CreatedTransport {
  transportNumber: string;
  description?: string;
  type?: string;
  targetSystem?: string;
  targetDescription?: string;
  ctsProject?: string;
  ctsProjectDescription?: string;
  uri?: string;
  parent?: string;
  owner?: string;
}

export async function handleCreateTransport(
  context: HandlerContext,
  args: CreateTransportArgs,
) {
  const { connection, logger } = context;
  const { description, transport_type } = args;

  if (!description) {
    return return_error(new Error('description is required'));
  }

  return answer(
    { tool: 'CreateTransportLow', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getRequest(resultsFor(transportDocuments, ['created']))
        .create(
          {
            description,
            transportType: transport_type || 'workbench',
          },
          { analyse: analyseException },
        ),
    (value: CreatedTransport) => ({
      success: true,
      transport_number: value.transportNumber,
      description: value.description ?? description,
      transport_type: transport_type || 'workbench',
      target_system: value.targetSystem ?? null,
      owner: value.owner ?? null,
      message: `Transport request ${value.transportNumber} created successfully.`,
    }),
  );
}
