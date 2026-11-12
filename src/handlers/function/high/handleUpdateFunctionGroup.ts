import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * UpdateFunctionGroup Handler - Update Existing ABAP Function Group Metadata
 *
 * Function groups are containers for function modules and don't have source
 * code to update. This handler updates function group metadata (description)
 * through AdtClient.getFunctionGroup().{lock,readMetadata,updateMetadata,
 * unlock} from @mcp-abap-adt/adt-clients 19, via `withLock` — the lock is
 * held for the read-modify-write in its body, released on every path out.
 *
 * **The patched document goes in `options.source`, not a raw PUT this
 * handler built itself.** The pre-migration handler issued its own
 * `connection.makeAdtRequest` PUT against the functions/groups endpoint with
 * a hand-built URL and content type; `AdtFunctionGroup.updateMetadata()`
 * reads the body — `config.document` then, `options?.source` since
 * `interfaces-adt@9` merged the channels — and does that request itself now.
 * Verified against `AdtFunctionGroup.ts` in adt-clients 22.
 *
 * The patch itself is adt-clients' `patchFunctionGroupDocument` — the
 * description only, on `group:abapFunctionGroup`, passed as given: SAP holds
 * 40 characters and answers a longer one `400` `FUNC_ADT/103`, which reaches
 * the model as it is. A refused patch is the failure of the step `patch`
 * (`documentPatch.ts`); nothing is written.
 */

import {
  functionGroupDocuments,
  patchFunctionGroupDocument,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { patchedDocument } from '../../../lib/strategies/documentPatch';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { atStep } from '../../../lib/strategies/step';
import { withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateFunctionGroup',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Update metadata (description) of an existing ABAP function group. Function groups are containers for function modules, which carry the source; this updates the group's metadata alone. Locks the group, writes, and unlocks it.",
  inputSchema: z.object({
    function_group_name: z
      .string()
      .describe('Function group name. Must exist in the system.'),
    description: z.string().describe('New description for the function group.'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number, not a task. Optional if object is local or already in transport.',
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

type UpdateFunctionGroupArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleUpdateFunctionGroup(
  context: HandlerContext,
  args: UpdateFunctionGroupArgs,
) {
  const { connection, logger } = context;

  if (!args.function_group_name || !args.description) {
    return return_error(
      new Error('function_group_name and description are required'),
    );
  }

  const functionGroupName = args.function_group_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateFunctionGroup', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getFunctionGroup(
        resultsFor(functionGroupDocuments),
      );

      return withLock(
        () => obj.lock({ functionGroupName }, { analyse: analyseLock }),
        (lockHandle): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> =>
          sequence(
            atStep('read metadata', () =>
              obj.readMetadata(
                { functionGroupName },
                { version: 'workingArea', analyse: analyseException },
              ),
            ),
            async (current) =>
              patchedDocument(
                patchFunctionGroupDocument(current.raw, {
                  description: args.description || undefined,
                }),
                `function group ${functionGroupName}`,
              ),
            atStep('update metadata', (document) =>
              withAdtHeaders(
                context,
                'functionGroup.updateMetadata',
                (headers) =>
                  obj.updateMetadata(
                    {
                      functionGroupName,
                      transportRequest: args.transport_request,
                    },
                    {
                      headers,
                      source: document,
                      lockHandle,
                      analyse: analyseException,
                    },
                  ),
              ),
            ),
          ),
        (lockHandle) =>
          obj.unlock({ functionGroupName }, lockHandle, {
            analyse: analyseException,
          }),
        { type: 'FUNCTION_GROUP', name: functionGroupName },
      );
    },
    project(detail, terseWrite),
  );
}
