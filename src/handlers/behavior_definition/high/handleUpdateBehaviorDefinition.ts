/**
 * UpdateBehaviorDefinition Handler - ABAP Behavior Definition Update via ADT API
 *
 * Uses AdtClient.getBehaviorDefinition().{lock,update,unlock,read,activate}
 * from @mcp-abap-adt/adt-clients 19, through `withLock` when this handler
 * owns the lock — held for the whole write, released on every path out. A
 * caller who passes `lock_handle` already holds it, so `withLock` is
 * skipped and the update runs as the one request it is.
 *
 * The wait between the write and `activate` is the pre-migration handler's
 * long-polling `read({withLongPolling: true})`, discarded for its result
 * but not for what it does — see `handleUpdateDomain.ts` (high) for the
 * live incident this guards against, documented in `xmlPatch.ts`.
 *
 * **The source goes in `options`, not `config`.** See
 * `UpdateBehaviorDefinitionLow` — the shipped `AdtBehaviorDefinition.update()`
 * reads `options?.sourceCode` only.
 */

import { behaviorDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
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
import { carryCleanup, withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateBehaviorDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update, Create. Subject: BehaviorDefinition. Will be useful for updating or creating behavior definition. Update source code of an existing ABAP Behavior Definition (BDEF). Locks, updates, unlocks, and optionally activates.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Behavior Definition name',
      },
      source_code: {
        type: 'string',
        description: 'New source code',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockObject. If not provided, will attempt to lock internally (not recommended for stateful flows).',
      },
      activate: {
        type: 'boolean',
        description: 'Activate after update. Default: true',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['name', 'source_code'],
  },
} as const;

interface UpdateBehaviorDefinitionArgs {
  name: string;
  source_code: string;
  transport_request?: string;
  lock_handle?: string;
  activate?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateBehaviorDefinition(
  context: HandlerContext,
  args: UpdateBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;

  if (!args.name || !args.source_code) {
    return return_error(new Error('Missing required parameters'));
  }

  const name = args.name.toUpperCase();
  const shouldActivate = args.activate !== false;
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateBehaviorDefinition', detail },
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const obj = createAdtClient(connection, logger).getBehaviorDefinition(
        resultsFor(behaviorDefinitionDocuments),
      );

      const update = (lockHandle: string) =>
        obj.update(
          { name, transportRequest: args.transport_request },
          {
            sourceCode: args.source_code,
            lockHandle,
            analyse: analyseException,
          },
        );

      const written = args.lock_handle
        ? await update(args.lock_handle)
        : await withLock(
            () => obj.lock({ name }),
            update,
            (lockHandle) => obj.unlock({ name }, lockHandle),
          );

      if (!written.ok) {
        return written as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      // Best-effort: wait for the write to be visible before activating.
      await obj
        .read({ name }, 'inactive', {
          withLongPolling: true,
          analyse: analyseException,
        })
        .catch(() => undefined);

      if (!shouldActivate) {
        return written;
      }

      return carryCleanup(written, () =>
        obj.activate({ name }, { analyse: analyseActivation }),
      );
    },
    project(detail, terseWrite),
  );
}
