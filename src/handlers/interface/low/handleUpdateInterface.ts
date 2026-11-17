import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * UpdateInterface Handler - Update ABAP Interface Source Code
 *
 * Uses AdtClient.getInterface().update from @mcp-abap-adt/adt-clients 19.
 *
 * **The source goes in `options`, not `config`.** `IInterfaceConfig` still
 * declares a `source` field, so `update({ interfaceName, source },
 * ...)` compiles either way — but the shipped `AdtInterface.update()` reads
 * `options?.source` only (its own comment: "This used to fall back to
 * `config.source` — two channels for one value, where the contract
 * documents one"). A `.d.ts` comment is not evidence for where a value
 * lands; the compiled JavaScript is. Verified against `AdtInterface.js`, not
 * the declaration file.
 */

import { interfaceDocuments } from '@mcp-abap-adt/adt-clients';
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
  name: 'UpdateInterfaceLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Update source code of an existing ABAP interface. Requires lock handle from LockObject. - use UpdateInterface (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: z.object({
    interface_name: z
      .string()
      .describe('Interface name. Interface must already exist.'),
    source_code: z.string().describe('Complete ABAP interface source code.'),
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

type UpdateInterfaceArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleUpdateInterface(
  context: HandlerContext,
  args: UpdateInterfaceArgs,
) {
  const { connection, logger } = context;
  const { interface_name, source_code, lock_handle } = args;

  if (!interface_name || !source_code || !lock_handle) {
    return return_error(
      new Error('interface_name, source_code, and lock_handle are required'),
    );
  }

  const interfaceName = interface_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateInterfaceLow', detail },
    () =>
      withAdtHeaders(context, 'interface.update', (headers) =>
        createAdtClient(connection, logger)
          .getInterface(resultsFor(interfaceDocuments))
          .update(
            {
              interfaceName,
              ...(args.transport_request && {
                transportRequest: args.transport_request,
              }),
            },
            {
              headers,
              source: source_code,
              lockHandle: lock_handle,
              analyse: analyseException,
            },
          ),
      ),
    project(detail, terseWrite),
  );
}
