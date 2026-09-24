/**
 * DeleteLocalMacros Handler - Empty a class's local macros include
 *
 * Uses AdtClient.getLocalMacros().{lock,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock`. Same shape as
 * `DeleteLocalDefinitions` — see its own doc comment for the full reasoning:
 * `AdtLocalMacros.delete()` is `update({...config, macrosCode: ''})` under a
 * different name, and the declared `ILocalMacrosContract` type does not
 * carry `delete` at all, so this calls `update()` with empty source
 * directly, under the class's own lock via `withLock`.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseActivation,
  analyseException,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteLocalMacros',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete local macros from an ABAP class by clearing the macros include. Manages lock, update, unlock, and optional activation. Note: Macros are supported in older ABAP versions but not in newer ones.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name (e.g., ZCL_MY_CLASS).',
      },
      transport_request: {
        type: 'string',
        description: 'Transport request number.',
      },
      activate_on_delete: {
        type: 'boolean',
        description: 'Activate parent class after deleting. Default: false',
        default: false,
      },
      ...DETAIL_PROPERTY,
    },
    required: ['class_name'],
  },
} as const;

interface DeleteLocalMacrosArgs {
  class_name: string;
  transport_request?: string;
  activate_on_delete?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteLocalMacros(
  context: HandlerContext,
  args: DeleteLocalMacrosArgs,
) {
  const { connection, logger } = context;

  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }

  const className = args.class_name.toUpperCase();
  const shouldActivate = args.activate_on_delete === true;
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteLocalMacros', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getLocalMacros(
        resultsFor(classDocuments),
      );

      const deleted = await withLock(
        () => obj.lock({ className }),
        (lockHandle) =>
          obj.update(
            { className, transportRequest: args.transport_request },
            { source: '', lockHandle, analyse: analyseException },
          ),
        (lockHandle) => obj.unlock({ className }, lockHandle),
      );

      if (!deleted.ok || !shouldActivate) {
        return deleted as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      return carryCleanup(deleted, () =>
        obj.activate({ className }, { analyse: analyseActivation }),
      );
    },
    project(detail, terseWrite),
  );
}
