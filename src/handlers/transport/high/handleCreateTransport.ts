import * as z from 'zod';
import { createArguments } from '../../../lib/handlers/createArguments';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
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

import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  type ICreatedTransport,
  transportCreated,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project } from '../../../lib/strategies/projections';
import { verbatim } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateTransport',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Create a new ABAP transport request in SAP system for development objects.',
  inputSchema: createArguments('CreateTransport', {
    transport_type: z
      .enum(['workbench', 'customizing'])
      .default('workbench')
      .optional()
      .describe(
        "Transport type: 'workbench' (cross-client) or 'customizing' (client-specific)",
      ),
    description: z
      .string()
      .describe('Transport request description (mandatory)'),
    target_system: z
      .string()
      .optional()
      .describe(
        "Target system for transport (optional, e.g., 'PRD', 'QAS'). If not provided or empty, uses 'LOCAL'",
      ),
    owner: z
      .string()
      .optional()
      .describe('Transport owner (optional, defaults to current user)'),
    ...DETAIL_SHAPE,
  }),
} as const;

type CreateTransportArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleCreateTransport(
  context: HandlerContext,
  args: CreateTransportArgs,
) {
  const { connection, logger } = context;

  if (!args?.description) {
    return return_error(new Error('description is required'));
  }

  const detail = detailOf(args);
  // SAP stores user ids in upper case: a lower-case owner is refused as an
  // unknown user (400, measured), so the id is sent upper-cased.
  const owner = args.owner?.trim().toUpperCase() || undefined;

  const terseCreatedTransport = (created: ICreatedTransport) => {
    return {
      success: true,
      transport_number: created.transportNumber,
      description: created.description ?? args.description,
      transport_type: args.transport_type || 'workbench',
      target_system: created.targetSystem ?? args.target_system ?? null,
      owner: created.owner ?? owner ?? null,
      message: `Transport request ${created.transportNumber} created successfully.`,
    };
  };

  return answer(
    { tool: 'CreateTransport', detail },
    () =>
      withAdtHeaders(context, 'request.create', (headers) =>
        createAdtClient(connection, logger)
          .getRequest({
            ...resultsFor(transportDocuments),
            created: createdReading,
          })
          .create(
            {
              description: args.description,
              transportType: args.transport_type || 'workbench',
              targetSystem: args.target_system,
              owner,
            },
            { headers, analyse: analyseException },
          ),
      ),
    (reading) =>
      project(detail, () => terseCreatedTransport(reading.created()))(reading),
  );
}

/**
 * `created` read as the table reads it (`verbatim`: the body is the value),
 * with the created request beside it: adt-strategies' `transportCreated` over
 * the same answer, asked only by the terse projection — the body is parsed
 * once it is needed, as it was, and `full` and `raw` read the body alone.
 */
function createdReading(answer: IAdtWireResponse) {
  return {
    ...verbatim(answer),
    created: (): ICreatedTransport => transportCreated(answer),
  };
}
