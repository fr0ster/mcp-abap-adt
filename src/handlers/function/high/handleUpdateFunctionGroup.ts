/**
 * UpdateFunctionGroup Handler - Update Existing ABAP Function Group Metadata
 *
 * Function groups are containers for function modules and don't have source
 * code to update. This handler updates function group metadata (description)
 * through AdtClient.getFunctionGroup().{lock,readMetadata,updateMetadata,
 * unlock} from @mcp-abap-adt/adt-clients 19, via `withLock` — the lock is
 * held for the read-modify-write in its body, released on every path out.
 *
 * **The patched document goes in `config.document`, not a raw PUT this
 * handler built itself.** The pre-migration handler issued its own
 * `connection.makeAdtRequest` PUT against the functions/groups endpoint with
 * a hand-built URL and content type; `AdtFunctionGroup.updateMetadata()`
 * reads `config.document` and does that request itself now. Verified against
 * the compiled `AdtFunctionGroup.js`, not the declaration file.
 */

import { functionGroupDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { withLock } from '../../../lib/strategies/withLock';
import {
  extractXmlString,
  patchXmlAttribute,
} from '../../../lib/strategies/xmlPatch';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateFunctionGroup',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    "Update metadata (description) of an existing ABAP function group. Function groups are containers for function modules and don't have source code to update directly. Uses stateful session with proper lock/unlock mechanism.",
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description:
          'Function group name (e.g., ZTEST_FG_001). Must exist in the system.',
      },
      description: {
        type: 'string',
        description: 'New description for the function group.',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Optional if object is local or already in transport.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['function_group_name', 'description'],
  },
} as const;

interface UpdateFunctionGroupArgs {
  function_group_name: string;
  description: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

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
  // SAP requirement: `adtcore:description` is limited to 40 characters.
  const description =
    args.description.length > 40
      ? args.description.substring(0, 40)
      : args.description;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateFunctionGroup', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getFunctionGroup(
        resultsFor(functionGroupDocuments),
      );

      return withLock(
        () => obj.lock({ functionGroupName }),
        (lockHandle): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> =>
          sequence(
            () =>
              obj.readMetadata(
                { functionGroupName },
                { analyse: analyseException },
              ),
            (current) =>
              obj.updateMetadata(
                {
                  functionGroupName,
                  transportRequest: args.transport_request,
                  document: patchXmlAttribute(
                    extractXmlString(
                      current.raw,
                      `function group ${functionGroupName}`,
                    ),
                    'adtcore:description',
                    description,
                  ),
                },
                { lockHandle, analyse: analyseException },
              ),
          ),
        (lockHandle) => obj.unlock({ functionGroupName }, lockHandle),
      );
    },
    project(detail, terseWrite),
  );
}
