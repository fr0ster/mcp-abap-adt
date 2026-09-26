/**
 * CreateTransport Handler - Create ABAP Transport Request
 *
 * Uses AdtClient.getRequest().create from @mcp-abap-adt/adt-clients 19.
 *
 * **`created` is NOT kept as shipped — `resultsFor(transportDocuments)`
 * plain, then the number is parsed out here.** The two-exception keep-list
 * (`ourUtils` keeping `utilDocuments.activation` and `unitTestDocuments.run`)
 * is for a reading that looks at something the table's three readings
 * literally cannot see: a `Location` **header**. `transportDocuments.created`
 * (the shipped `parseCreatedTransport`) reads the **body** — `tm:root`/
 * `tm:request` — which is exactly what `verbatim` (the table's default for
 * the slot name `created`) already carries whole, as a string, in
 * `AdtReading.value`. Keeping the shipped reading here would have been a
 * third exception to a rule that only has two, for a reading the table can
 * already serve; parsing the number out of `value` in the projection, the
 * way every other named field in this migration is read out of a `structured`
 * `value`, is the one that keeps the rule at two.
 *
 * It also restores `detail`: a kept reading answers a plain object with no
 * `raw` and no `status`, and `project()` needs both — that is why this was
 * the one write tool in the cluster with no `detail` parameter, and adding
 * the parameter back is the same fix as dropping the keep-list, not a
 * second one.
 *
 * No corpus fixture for `/cts/transportrequests` POST exists — the README's
 * coverage table lists only the GET (an empty list, for `ListTransports`) —
 * so the document below is hand-built from the shipped `parseCreatedTransport`
 * and `create.js`'s own XML, not proven against a captured response.
 */

import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  transportCreated,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, type Terse } from '../../../lib/strategies/projections';
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
      ...DETAIL_PROPERTY,
    },
    required: ['description'],
  },
} as const;

interface CreateTransportArgs {
  description: string;
  transport_type?: 'workbench' | 'customizing';
  detail?: 'terse' | 'full' | 'raw';
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

  const detail = detailOf(args);

  // Parses the document `verbatim` (the table's default for `created`)
  // already carries whole — `parseCreatedTransport` is the same reading
  // `transportDocuments.created` ships with, called here instead of kept
  // there. `description`/`transport_type` come from the caller's own
  // request, not the document, matching what the tool always answered.
  const terseCreatedTransport: Terse<string> = (value) => {
    const created = // adt-clients 23 moved the reading to adt-strategies as a strategy over
      // the answer; the body is all it reads.
      transportCreated({ data: value } as IAdtWireResponse);
    return {
      success: true,
      transport_number: created.transportNumber,
      description: created.description ?? description,
      transport_type: transport_type || 'workbench',
      target_system: created.targetSystem ?? null,
      owner: created.owner ?? null,
      message: `Transport request ${created.transportNumber} created successfully.`,
    };
  };

  return answer(
    { tool: 'CreateTransportLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getRequest(resultsFor(transportDocuments))
        .create(
          {
            description,
            transportType: transport_type || 'workbench',
          },
          { analyse: analyseException },
        ),
    project(detail, terseCreatedTransport),
  );
}
