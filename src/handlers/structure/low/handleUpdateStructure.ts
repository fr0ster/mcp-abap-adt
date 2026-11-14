import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * UpdateStructureLow Handler - Update ABAP Structure DDL Source
 *
 * Uses AdtClient.getStructure().update from @mcp-abap-adt/adt-clients 19.
 *
 * **The source goes through `options.source`.** `AdtStructure.update()`'s
 * shipped body does keep a fallback — `const source = options?.source ||
 * config.source` — but this handler writes through `options` only, the one
 * channel every sibling family in this cluster shares, and never puts a
 * source string on `config`. Verified against `AdtStructure.js`, not the
 * declaration file.
 */

import { structureDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateStructureLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Update DDL source code of an existing ABAP structure. Requires lock handle from LockObject. - use UpdateStructureSource for full workflow with lock/unlock.',
  inputSchema: z.object({
    structure_name: z
      .string()
      .describe('Structure name. Structure must already exist.'),
    ddl_code: z
      .string()
      .describe('Complete DDL source code for the structure definition.'),
    lock_handle: z
      .string()
      .describe('Lock handle from LockObject. Required for update operation.'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number (required for transportable packages), not a task.',
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

type UpdateStructureArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleUpdateStructure(
  context: HandlerContext,
  args: UpdateStructureArgs,
) {
  const { connection, logger } = context;
  const { structure_name, ddl_code, lock_handle } = args;

  if (!structure_name || !ddl_code || !lock_handle) {
    return return_error(
      new Error('structure_name, ddl_code, and lock_handle are required'),
    );
  }

  const structureName = structure_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateStructureLow', detail },
    () =>
      withAdtHeaders(context, 'structure.update', (headers) =>
        createAdtClient(connection, logger)
          .getStructure(resultsFor(structureDocuments))
          .update(
            {
              structureName,
              ...(args.transport_request && {
                transportRequest: args.transport_request,
              }),
            },
            {
              headers,
              source: ddl_code,
              lockHandle: lock_handle,
              analyse: analyseException,
            },
          ),
      ),
    project(detail, terseWrite),
  );
}
