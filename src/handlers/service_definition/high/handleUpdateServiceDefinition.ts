/**
 * UpdateServiceDefinition Handler - Update Existing ABAP Service Definition Source
 *
 * Uses AdtClient.getServiceDefinition().{lock,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock` — held for the whole
 * write, released on every path out.
 *
 * Workflow: lock -> update -> unlock -> (activate). The `check` the
 * pre-migration handler ran between `update` and `unlock` (swallowed except
 * for a genuine, non-"already checked" refusal) is gone: it duplicated what
 * `update`'s own `analyseException` already verdicts.
 *
 * **The source goes in `options`, not `config`.** The shipped
 * `AdtServiceDefinition.update()` reads `options?.sourceCode` only and
 * passes `config.transportRequest` straight through — verified against the
 * compiled `AdtServiceDefinition.js`, not the declaration file.
 */

import { serviceDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateServiceDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update, Create. Subject: ServiceDefinition. Will be useful for updating or creating service definition. Update source code of an existing ABAP service definition. Locks, updates, unlocks, and optionally activates.',
  inputSchema: {
    type: 'object',
    properties: {
      service_definition_name: {
        type: 'string',
        description:
          'Service definition name (e.g., ZSD_MY_SERVICE). Must exist in the system.',
      },
      source_code: {
        type: 'string',
        description: 'Complete service definition source code.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Optional if object is local or already in transport.',
      },
      activate: {
        type: 'boolean',
        description: 'Activate service definition after update. Default: true.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['service_definition_name', 'source_code'],
  },
} as const;

interface UpdateServiceDefinitionArgs {
  service_definition_name: string;
  source_code: string;
  transport_request?: string;
  activate?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateServiceDefinition(
  context: HandlerContext,
  args: UpdateServiceDefinitionArgs,
) {
  const { connection, logger } = context;

  if (!args.service_definition_name || !args.source_code) {
    return return_error(
      new Error('service_definition_name and source_code are required'),
    );
  }

  const serviceDefinitionName = args.service_definition_name.toUpperCase();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateServiceDefinition', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getServiceDefinition(
        resultsFor(serviceDefinitionDocuments),
      );

      const written = await withLock(
        () => obj.lock({ serviceDefinitionName }),
        (lockHandle) =>
          obj.update(
            {
              serviceDefinitionName,
              transportRequest: args.transport_request,
            },
            {
              sourceCode: args.source_code,
              lockHandle,
              analyse: analyseException,
            },
          ),
        (lockHandle) => obj.unlock({ serviceDefinitionName }, lockHandle),
      );

      if (!written.ok || !shouldActivate) {
        return written as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return obj.activate(
        { serviceDefinitionName },
        { analyse: analyseActivation },
      );
    },
    project(detail, terseWrite),
  );
}
