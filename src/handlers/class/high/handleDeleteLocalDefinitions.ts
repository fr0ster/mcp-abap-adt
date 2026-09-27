/**
 * DeleteLocalDefinitions Handler - Empty a class's local definitions include
 *
 * Uses AdtClient.getLocalDefinitions().{lock,update,unlock,activate} from
 * @mcp-abap-adt/adt-clients 19, through `withLock`.
 *
 * **Calls `update()` with empty source, not `delete()`.** Two findings,
 * both confirmed against the shipped `.js`, not the `.d.ts`:
 *
 * 1. `ILocalDefinitionsContract` (what `getLocalDefinitions()` is declared to
 *    return) is not `IAdtDeletable` at all, and its own file's doc comment
 *    says why: "there is no resource to DELETE and none to ask about" — a
 *    class include has no deletion-service endpoint. `AdtLocalDefinitions`
 *    implements a `delete()` method regardless, but its body is exactly
 *    `return this.update({ ...config, definitionsCode: '' }, options)` — a
 *    convenience name for the empty write, not a different call. Calling
 *    `update()` with `source: ''` directly is the identical wire
 *    request, made through a method the declared type actually has.
 * 2. `update()` never locks itself. The same accessor composes
 *    `IAdtLockable`, delegating to the class's own lock, so this handler
 *    acquires it exactly as `UpdateLocalDefinitions` does, through
 *    `withLock`.
 *
 * `analyseException`, not `analyseDeletion`: the answer is a PUT result
 * (`updated` slot), not a `del:deletionResult`/`del:checkResponse` document,
 * so the deletion strategy has nothing to read here.
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
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteLocalDefinitions',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete local definitions from an ABAP class by clearing the definitions include. Manages lock, update, unlock, and optional activation.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Parent class name (e.g., ZCL_MY_CLASS).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
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

interface DeleteLocalDefinitionsArgs {
  class_name: string;
  transport_request?: string;
  activate_on_delete?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteLocalDefinitions(
  context: HandlerContext,
  args: DeleteLocalDefinitionsArgs,
) {
  const { connection, logger } = context;

  if (!args?.class_name) {
    return return_error(new Error('class_name is required'));
  }

  const className = args.class_name.toUpperCase();
  const shouldActivate = args.activate_on_delete === true;
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteLocalDefinitions', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getLocalDefinitions(
        resultsFor(classDocuments),
      );

      const deleted = await withLock(
        () => obj.lock({ className }, { analyse: analyseLock }),
        (lockHandle) =>
          obj.update(
            { className, transportRequest: args.transport_request },
            { source: '', lockHandle, analyse: analyseException },
          ),
        (lockHandle) =>
          obj.unlock({ className }, lockHandle, { analyse: analyseException }),
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
